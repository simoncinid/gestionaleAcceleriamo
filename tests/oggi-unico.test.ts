import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { authed, call } from "./helpers";
import type { Oggi } from "../worker/today/tipi";
import { ORARIO_DEFAULT, scadenzaLavorativa } from "../worker/regole/orario";
import { scadenzaPrimaChiamata } from "../worker/regole/sla";

const GIORNO = 86_400_000;
// Venerdì 9 ottobre 2026 alle 23:20 a Roma (UTC+2): fuori orario.
const VENERDI_SERA = Date.UTC(2026, 9, 9, 21, 20);
// Sabato 10 ottobre alle 8:30 riapre, più 120 minuti di SLA: 10:30 a Roma.
const SCADENZA = Date.UTC(2026, 9, 10, 8, 30);

async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: id, source: "manuale", stage_id: "da-richiamare", stage_changed_at: VENERDI_SERA, next_action: "Richiamare", next_action_at: VENERDI_SERA + 10 * GIORNO, created_at: VENERDI_SERA - GIORNO, updated_at: VENERDI_SERA, owner_id: "tommaso", ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}

// Tutte le righe che Oggi mostra, con la sezione in cui stanno.
function righe(o: Oggi): [string, string][] {
  const r: [string, string][] = [];
  if (o.adesso) r.push(["adesso", o.adesso.tipo === "call" ? o.adesso.leadId : o.adesso.id]);
  for (const l of o.nuovi) r.push(["nuovi", l.id]);
  for (const k of o.call) r.push(["call", k.leadId]);
  for (const l of o.daFare) r.push(["daFare", l.id]);
  for (const p of o.proposte) r.push(["proposte", p.leadId]);
  for (const l of o.finePausa) r.push(["finePausa", l.id]);
  for (const l of o.fermi) r.push(["fermi", l.id]);
  return r;
}

describe("scadenza della prima chiamata (una sola funzione)", () => {
  it("lead arrivato venerdì alle 23:20: scade sabato alle 10:30, uguale in Oggi, Scaletta, Elenco e scheda", async () => {
    expect(scadenzaPrimaChiamata(VENERDI_SERA, { minuti: 120, orario: ORARIO_DEFAULT })).toBe(SCADENZA);
    const cookie = await authed();
    // Come la 1A: la prossima azione del lead nuovo ha la data dell'arrivo.
    await insertLead("notturno", { stage_id: "da-chiamare-prima-volta", next_action: "Prima chiamata", next_action_at: VENERDI_SERA, created_at: VENERDI_SERA, stage_changed_at: VENERDI_SERA });
    await insertLead("altro-nuovo", { stage_id: "da-chiamare-prima-volta", next_action: "Prima chiamata", next_action_at: VENERDI_SERA - 60_000, created_at: VENERDI_SERA - 60_000 });

    const o = (await (await call(`/api/today?chi=tutte&now=${VENERDI_SERA + 60_000}`, {}, cookie)).json()) as Oggi;
    const daOggi = [...(o.adesso?.tipo === "lead" ? [o.adesso] : []), ...o.nuovi].find((l) => l.id === "notturno")!;
    expect(daOggi.slaScadenza).toBe(SCADENZA);
    expect(daOggi.nextActionAt).toBe(SCADENZA);

    const elenco = (await (await call("/api/leads", {}, cookie)).json()) as { leads: { id: string; nextActionAt: number }[] };
    expect(elenco.leads.find((l) => l.id === "notturno")!.nextActionAt).toBe(SCADENZA);
    const vista = (await (await call("/api/leads?vista=nuovi", {}, cookie)).json()) as { leads: { id: string; nextActionAt: number }[] };
    expect(vista.leads.find((l) => l.id === "notturno")!.nextActionAt).toBe(SCADENZA);
    const scheda = (await (await call("/api/leads/notturno", {}, cookie)).json()) as { lead: { nextActionAt: number } };
    expect(scheda.lead.nextActionAt).toBe(SCADENZA);
  });

  it("una data scelta a mano per il lead nuovo resta quella", async () => {
    const cookie = await authed();
    await insertLead("rimandato", { stage_id: "da-chiamare-prima-volta", next_action: "Prima chiamata", next_action_at: VENERDI_SERA + 3 * GIORNO, created_at: VENERDI_SERA });
    const scheda = (await (await call("/api/leads/rimandato", {}, cookie)).json()) as { lead: { nextActionAt: number } };
    expect(scheda.lead.nextActionAt).toBe(VENERDI_SERA + 3 * GIORNO);
  });

  it("il lead creato a mano salva già la scadenza con l'orario di apertura", async () => {
    const cookie = await authed();
    const r = await call("/api/leads", { method: "POST", json: { company: "Officina Prova" } }, cookie);
    expect(r.status).toBe(201);
    const { lead } = (await r.json()) as { lead: { id: string; createdAt: number; nextActionAt: number } };
    const atteso = scadenzaLavorativa(lead.createdAt, 120, ORARIO_DEFAULT);
    expect(lead.nextActionAt).toBe(atteso);
    const salvato = await env.DB.prepare("SELECT next_action_at n FROM leads WHERE id = ?").bind(lead.id).first<{ n: number }>();
    expect(salvato?.n).toBe(atteso);
  });
});

describe("Oggi: ogni lead una volta sola, un solo conteggio", () => {
  it("Adesso non si ripete in Da fare, la call compare una volta, fermi senza doppioni; titolo e badge uguali", async () => {
    const cookie = await authed();
    const ora = Date.UTC(2026, 9, 13, 10, 0); // martedì 13 ottobre, 12:00 a Roma
    // Scaduto da tempo e fermo da 9 giorni: Adesso, non anche nei fermi.
    await insertLead("scaduto", { next_action_at: ora - 2 * 3_600_000, stage_changed_at: ora - 9 * GIORNO, created_at: ora - 10 * GIORNO });
    // Call fra 20 minuti: la prossima azione è la call stessa.
    await insertLead("con-call", { stage_id: "appuntamento-confermato", next_action: "Call di conoscenza", next_action_at: ora + 20 * 60_000, stage_changed_at: ora - GIORNO, created_at: ora - 2 * GIORNO });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k1', 'con-call', 'conoscenza', ?, ?, ?)").bind(ora + 20 * 60_000, ora, ora).run();
    await insertLead("altro", { next_action_at: ora - 60_000, stage_changed_at: ora - 9 * GIORNO, created_at: ora - 10 * GIORNO });

    const o = (await (await call(`/api/today?chi=mie&now=${ora}`, {}, cookie)).json()) as Oggi;
    const tutte = righe(o);
    const ids = tutte.map(([, id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(o.adesso).toMatchObject({ tipo: "lead", id: "scaduto" });
    expect(o.daFare.map((l) => l.id)).toEqual(["altro"]);
    expect(o.call.map((k) => k.id)).toEqual(["k1"]);
    expect(o.fermi).toEqual([]);

    // Il titolo conta le righe mostrate (fermi esclusi, a scomparsa).
    const mostrate = tutte.filter(([sezione]) => sezione !== "fermi").length;
    expect(o.totale).toBe(mostrate);
    // Il badge è lo stesso numero di Oggi con "Mie", calcolato adesso.
    await insertLead("scaduto-adesso", { next_action_at: Date.now() - 1000, stage_changed_at: Date.now(), created_at: Date.now() - GIORNO });
    await insertLead("dopo-adesso", { next_action_at: Date.now() - 500, stage_changed_at: Date.now(), created_at: Date.now() - GIORNO });
    const adesso = (await (await call("/api/today?chi=mie", {}, cookie)).json()) as Oggi;
    const badge = (await (await call("/api/badge", {}, cookie)).json()) as { commerciale: number };
    expect(badge.commerciale).toBe(adesso.totale);
    expect(badge.commerciale).toBeGreaterThanOrEqual(2);
  });
});
