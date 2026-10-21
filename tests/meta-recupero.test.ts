import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { giro } from "../worker/cron";
import type { Env } from "../worker/env";
import { setEmailFetch } from "../worker/email/fetcher";
import { daRoma } from "../worker/lib/roma";
import { setMetaFetch } from "../worker/meta/fetcher";
import { retryPendingMetaLeads } from "../worker/meta/ingest";
import { CHIAVE_RECUPERO, recuperaLeadMeta, type StatoRecupero } from "../worker/meta/recupero";
import { contaD1 } from "../worker/lib/bilancio";
import { createUser } from "./helpers";

const ORA = daRoma(2026, 10, 22, 10, 15);
const conPagina = { ...env, META_PAGE_ID: "pagina-1" } as Env;
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "+0000");
const leadGraph = (id: string, creato: number, nome = "Mario Rossi") => ({
  id, created_time: iso(creato), field_data: [{ name: "full_name", values: [nome] }, { name: "company_name", values: [`${nome} Srl`] }],
});

type Pagina = { data: unknown[]; after?: string };
// Graph finta: l'elenco dei moduli e una batch con una pagina per modulo (per cursore). Registra le richieste.
function graphFinta(moduli: string[], pagine: Record<string, Pagina>) {
  const chiamate: { url: string; batch?: { relative_url: string }[] }[] = [];
  setMetaFetch(async (url, init) => {
    if (url.includes("/leadgen_forms")) {
      chiamate.push({ url });
      return Response.json({ data: moduli.map((id) => ({ id })) });
    }
    if (init?.method === "POST") {
      const corpo = new URLSearchParams(init.body as URLSearchParams);
      const batch = JSON.parse(corpo.get("batch")!) as { relative_url: string }[];
      chiamate.push({ url, batch });
      return Response.json(batch.map((b) => {
        const modulo = b.relative_url.split("/")[0];
        const dopo = /after=([^&]+)/.exec(b.relative_url)?.[1];
        const p = pagine[dopo ? `${modulo}@${decodeURIComponent(dopo)}` : modulo] ?? { data: [] };
        return { code: 200, body: JSON.stringify({ data: p.data, paging: p.after ? { cursors: { after: p.after }, next: "https://graph/next" } : {} }) };
      }));
    }
    // Completamento del singolo lead (lavoro "meta").
    const id = /v23\.0\/([^?]+)/.exec(url)?.[1] ?? "";
    return Response.json({ field_data: [{ name: "full_name", values: [`Persona ${id}`] }, { name: "email", values: [`${id}@esempio.it`] }], form_id: "f1" });
  });
  return chiamate;
}

const stato = async () => JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(CHIAVE_RECUPERO).first<{ value: string }>())!.value) as StatoRecupero;
const leadMeta = () => env.DB.prepare("SELECT meta_lead_id AS id, meta_form_id AS modulo, created_at AS creato, meta_status AS stato FROM leads WHERE source = 'meta' ORDER BY meta_lead_id").all<{ id: string; modulo: string; creato: number; stato: string }>().then((r) => r.results);

afterEach(() => { setMetaFetch(null); setEmailFetch(null); });

describe("recupero dei lead Meta", () => {
  it("senza id della Pagina o senza token è spento e non chiama Meta", async () => {
    const chiamate = graphFinta(["f1"], {});
    expect(await recuperaLeadMeta(env, ORA, 5)).toMatchObject({ spento: true });
    expect(await recuperaLeadMeta({ ...conPagina, META_PAGE_TOKEN: "" }, ORA, 5)).toMatchObject({ spento: true });
    expect(chiamate).toHaveLength(0);
  });

  it("primo giro: 90 giorni, una batch per tutti i moduli, lead di prova esclusi, a pagine fino alla fine", async () => {
    const ieri = ORA - 86_400_000;
    const chiamate = graphFinta(["f1", "f2"], {
      f1: { data: [leadGraph("L1", ieri), { ...leadGraph("P1", ieri), field_data: [{ name: "email", values: ["test lead: dummy data for email"] }] }], after: "c1" },
      "f1@c1": { data: [leadGraph("L2", ieri - 1000)] },
      f2: { data: [leadGraph("L3", ieri)] },
    });
    const primo = await recuperaLeadMeta(conPagina, ORA, 5);
    expect(primo).toEqual({ nuovi: 2, sottorichieste: 2 });
    expect(chiamate[1].batch).toHaveLength(2);
    const filtro = decodeURIComponent(/filtering=([^&]+)/.exec(chiamate[1].batch![0].relative_url)![1]);
    expect(JSON.parse(filtro)[0]).toMatchObject({ field: "time_created", operator: "GREATER_THAN", value: Math.floor(ORA / 1000) - 90 * 86_400 });
    expect((await stato()).ciclo?.cursori).toEqual({ f1: "c1", f2: null });
    // Il token non finisce mai nell'indirizzo della batch.
    expect(chiamate[1].url).not.toContain("token-test");

    const secondo = await recuperaLeadMeta(conPagina, ORA + 900_000, 5);
    expect(secondo).toEqual({ nuovi: 1, sottorichieste: 1 });
    expect(chiamate[2].batch!.map((b) => b.relative_url.split("/")[0])).toEqual(["f1"]);
    const s = await stato();
    expect(s.ciclo).toBeNull();
    // Il ciclo è partito al primo giro: il prossimo filtro parte da lì, meno un'ora di margine.
    expect(s.da).toBe(Math.floor(ORA / 1000) - 3600);
    const lead = await leadMeta();
    expect(lead.map((l) => [l.id, l.modulo])).toEqual([["L1", "f1"], ["L2", "f1"], ["L3", "f2"]]);
    expect(lead.every((l) => l.stato === "pending")).toBe(true);
    expect(lead[0].creato).toBe(Date.parse(iso(ieri)));
  });

  it("non duplica i lead già arrivati e, oltre il limite, rilegge la stessa pagina al giro dopo", async () => {
    await env.DB.prepare("INSERT INTO leads (id, company, source, meta_lead_id, meta_status, stage_id, stage_changed_at, created_at, updated_at) VALUES ('x', 'Già qui', 'meta', 'L1', 'ok', 'da-chiamare-prima-volta', 1, 1, 1)").run();
    graphFinta(["f1"], { f1: { data: ["L1", "L2", "L3", "L4"].map((id) => leadGraph(id, ORA - 60_000)), after: "c1" } });
    expect(await recuperaLeadMeta(conPagina, ORA, 2)).toMatchObject({ nuovi: 2 });
    expect((await stato()).ciclo?.cursori).toEqual({});
    expect(await recuperaLeadMeta(conPagina, ORA + 900_000, 2)).toMatchObject({ nuovi: 1 });
    expect((await stato()).ciclo?.cursori).toEqual({ f1: "c1" });
    expect((await leadMeta()).map((l) => l.id)).toEqual(["L1", "L2", "L3", "L4"]);
  });

  it("non reimporta un lead già arrivato dal webhook e messo nel cestino", async () => {
    await env.DB.prepare("INSERT INTO leads (id, company, source, meta_lead_id, meta_status, stage_id, stage_changed_at, created_at, updated_at, deleted_at) VALUES ('p', 'Prova', 'meta', 'PROVA', 'ok', 'da-chiamare-prima-volta', 1, 1, 1, 2)").run();
    graphFinta(["f1"], { f1: { data: [leadGraph("PROVA", ORA - 60_000), leadGraph("NUOVO", ORA - 60_000)] } });
    expect(await recuperaLeadMeta(conPagina, ORA, 5)).toMatchObject({ nuovi: 1 });
    expect((await leadMeta()).map((l) => l.id)).toEqual(["NUOVO", "PROVA"]);
  });

  it("un errore di Meta ferma il giro con il messaggio, senza il token", async () => {
    setMetaFetch(async () => Response.json({ error: { message: "Invalid OAuth access token" } }, { status: 400 }));
    await expect(recuperaLeadMeta(conPagina, ORA, 5)).rejects.toThrow("elenco dei moduli: Graph API 400, Invalid OAuth access token");
  });

  it("un lead di settimane fa si completa senza catena: niente avviso né email di conferma", async () => {
    await createUser();
    graphFinta(["f1"], { f1: { data: [leadGraph("VECCHIO", ORA - 20 * 86_400_000), leadGraph("NUOVO", ORA - 600_000)] } });
    let email = 0;
    setEmailFetch(async () => { email++; return Response.json({ id: "re_1" }); });
    await recuperaLeadMeta(conPagina, ORA, 5);
    await retryPendingMetaLeads(conPagina, 5, ORA);
    const avvisi = await env.DB.prepare("SELECT entity_id AS id FROM notifications WHERE evento = 'lead_nuovo'").all<{ id: string }>();
    const nuovo = await env.DB.prepare("SELECT id FROM leads WHERE meta_lead_id = 'NUOVO'").first<{ id: string }>();
    expect(avvisi.results.map((a) => a.id)).toEqual([nuovo!.id]);
    expect(email).toBe(1);
    expect((await leadMeta()).every((l) => l.stato === "ok")).toBe(true);
  });

  it("nel giro delle :15 con 6 moduli: recupero e completamento insieme restano sotto 45 query e 15 sottorichieste", async () => {
    await createUser();
    const moduli = ["f1", "f2", "f3", "f4", "f5", "f6"];
    const chiamate = graphFinta(moduli, Object.fromEntries(moduli.map((m, i) => [m, { data: [leadGraph(`R${i}a`, ORA - 300_000), leadGraph(`R${i}b`, ORA - 200_000)] }])));
    setEmailFetch(async () => Response.json({ id: "re_1" }));
    const contatore = { query: 0 };
    const esito = await giro({ ...conPagina, DB: contaD1(env.DB, contatore) } as Env, ORA);
    expect(esito.errori).toEqual([]);
    expect(esito.fatti).toEqual(expect.arrayContaining(["meta_recupero"]));
    expect(contatore.query).toBeLessThanOrEqual(45);
    const graph = chiamate.length + (await env.DB.prepare("SELECT count(*) n FROM leads WHERE meta_status = 'ok'").first<{ n: number }>())!.n;
    expect(graph).toBeLessThanOrEqual(15);
    expect((await leadMeta()).length).toBeGreaterThanOrEqual(1);
  });
});
