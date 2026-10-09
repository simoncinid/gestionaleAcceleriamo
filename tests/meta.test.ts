import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { computeMetaSignature } from "../worker/meta/signature";
import { setMetaFetch } from "../worker/meta/fetcher";
import { retryPendingMetaLeads } from "../worker/meta/ingest";
import { authed, call } from "./helpers";

const graphOk = (fields: Record<string, string>, extra: Record<string, string> = {}) =>
  setMetaFetch(async () =>
    Response.json({
      field_data: Object.entries(fields).map(([name, v]) => ({ name, values: [v] })),
      campaign_name: "Campagna Ottobre",
      adset_name: "Imprenditori Toscana",
      ad_name: "Video Carolina",
      form_id: "form-1",
      ...extra,
    }),
  );

async function postWebhook(leadgenId: string, secret = "segreto-test") {
  const raw = JSON.stringify({
    object: "page",
    entry: [{ id: "page-1", time: 1, changes: [{ field: "leadgen", value: { leadgen_id: leadgenId, form_id: "form-1", page_id: "page-1" } }] }],
  });
  return call("/api/webhooks/meta", {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json", "x-hub-signature-256": await computeMetaSignature(raw, secret) },
  });
}

const leadByMeta = (id: string) => env.DB.prepare("SELECT * FROM leads WHERE meta_lead_id = ?").bind(id).first<Record<string, unknown>>();

afterEach(() => setMetaFetch(null));

describe("webhook Meta", () => {
  it("risponde alla verifica di Meta solo col token giusto", async () => {
    const ok = await call("/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verifica-test&hub.challenge=12345");
    expect(await ok.text()).toBe("12345");
    const ko = await call("/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=sbagliato&hub.challenge=12345");
    expect(ko.status).toBe(403);
  });

  it("rifiuta richieste con firma sbagliata senza creare lead", async () => {
    const res = await postWebhook("L1", "altro-segreto");
    expect(res.status).toBe(401);
    expect(await leadByMeta("L1")).toBeNull();
  });

  it("rifiuta richieste senza firma", async () => {
    const raw = JSON.stringify({ entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: "L0" } }] }] });
    const res = await call("/api/webhooks/meta", { method: "POST", body: raw });
    expect(res.status).toBe(401);
    expect(await leadByMeta("L0")).toBeNull();
  });

  it("crea e completa il lead con campagna e risposte", async () => {
    graphOk({ full_name: "Mario Rossi", email: "Mario@Rossi.it", phone_number: "+393331234567", company_name: "Rossi Srl", "quanti_dipendenti_hai?": "10-20" });
    const res = await postWebhook("L2");
    expect(res.status).toBe(200);
    const lead = await leadByMeta("L2");
    expect(lead).toMatchObject({
      company: "Rossi Srl", contact_name: "Mario Rossi", email_norm: "mario@rossi.it", phone_norm: "3331234567",
      meta_campaign: "Campagna Ottobre", meta_ad: "Video Carolina", meta_status: "ok", source: "meta",
      stage_id: "da-chiamare-prima-volta", next_action: "Prima chiamata",
    });
    expect(JSON.parse(String(lead?.meta_answers))["quanti_dipendenti_hai?"]).toBe("10-20");
  });

  it("dopo il riempimento la catena dà responsabile, punteggio e telefono in E.164", async () => {
    await authed();
    graphOk({ full_name: "Sara Verdi", email: "sara@verdi-prova.it", phone_number: "333 765 4321", company_name: "Verdi Prova" });
    await postWebhook("L-catena");
    expect(await leadByMeta("L-catena")).toMatchObject({ owner_id: "tommaso", score: "giallo", phone: "+393337654321", phone_norm: "3337654321" });
  });

  it("modulo senza campo azienda: usa il nome del contatto", async () => {
    graphOk({ first_name: "Anna", last_name: "Neri", email: "anna@neri.it" });
    await postWebhook("L3");
    const lead = await leadByMeta("L3");
    expect(lead?.company).toBe("Anna Neri");
    expect(JSON.parse(String(lead?.meta_answers))).toMatchObject({ first_name: "Anna", last_name: "Neri", email: "anna@neri.it" });
  });

  it("lo stesso webhook due volte crea un solo lead", async () => {
    graphOk({ full_name: "Uno" });
    await postWebhook("L4");
    await postWebhook("L4");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE meta_lead_id = 'L4'").first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("se Meta non risponde il lead resta visibile e il ritentativo lo completa", async () => {
    setMetaFetch(async () => new Response("errore", { status: 500 }));
    await postWebhook("L5");
    expect(await leadByMeta("L5")).toMatchObject({ meta_status: "error", meta_attempts: 1, company: "Lead Meta in arrivo" });
    const cookie = await authed();
    // Nella 1B il gruppo "Meta incompleti" non c'è più: il lead resta visibile tra i nuovi di Oggi.
    // Con la deduplica di Oggi (Q2) un lead sta in un solo gruppo: Adesso oppure i nuovi.
    const t = (await (await call("/api/today?chi=tutte", {}, cookie)).json()) as { adesso: { company?: string } | null; nuovi: { company: string }[] };
    expect([t.adesso?.company, ...t.nuovi.map((l) => l.company)]).toContain("Lead Meta in arrivo");
    graphOk({ full_name: "Recuperato", company_name: "Recuperato Spa" });
    expect(await retryPendingMetaLeads(env)).toBe(1);
    expect(await leadByMeta("L5")).toMatchObject({ meta_status: "ok", company: "Recuperato Spa" });
  });

  it("legge email e telefono di lavoro dei moduli B2B", async () => {
    graphOk({ full_name: "Anna Bianchi", work_email: "Anna@Bianchi.it", work_phone_number: "+39 340 1112223", company_name: "Bianchi Srl" });
    await postWebhook("L7");
    expect(await leadByMeta("L7")).toMatchObject({ email_norm: "anna@bianchi.it", phone_norm: "3401112223", company: "Bianchi Srl" });
  });

  it("segnala il doppione con un lead inserito a mano", async () => {
    const cookie = await authed();
    const manual = await call("/api/leads", { method: "POST", json: { company: "Già noto", phone: "333 999 8888" } }, cookie);
    const manualId = ((await manual.json()) as { lead: { id: string } }).lead.id;
    graphOk({ full_name: "Già noto", phone_number: "+39 3339998888" });
    await postWebhook("L6");
    expect((await leadByMeta("L6"))?.duplicate_of_id).toBe(manualId);
  });
});
