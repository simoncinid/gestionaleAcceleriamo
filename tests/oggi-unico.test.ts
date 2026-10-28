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
// Blocco 1: SLA di 30 minuti (sabato 08:30 + 30 minuti).
const SCADENZA = Date.UTC(2026, 9, 10, 7, 0);

async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: id, source: "manuale", stage_id: "da-richiamare", stage_changed_at: VENERDI_SERA, next_action: "Richiamare", next_action_at: VENERDI_SERA + 10 * GIORNO, created_at: VENERDI_SERA - GIORNO, updated_at: VENERDI_SERA, owner_id: "tommaso", ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}

describe("scadenza della prima chiamata (una sola funzione)", () => {
  it("lead arrivato venerdì alle 23:20: scade sabato alle 09:00, uguale in Oggi, Scaletta, Elenco e scheda", async () => {
    expect(scadenzaPrimaChiamata(VENERDI_SERA, { minuti: 30, orario: ORARIO_DEFAULT })).toBe(SCADENZA);
    const cookie = await authed();
    // Come la 1A: la prossima azione del lead nuovo ha la data dell'arrivo.
    await insertLead("notturno", { stage_id: "da-chiamare-prima-volta", next_action: "Prima chiamata", next_action_at: VENERDI_SERA, created_at: VENERDI_SERA, stage_changed_at: VENERDI_SERA });
    await insertLead("altro-nuovo", { stage_id: "da-chiamare-prima-volta", next_action: "Prima chiamata", next_action_at: VENERDI_SERA - 60_000, created_at: VENERDI_SERA - 60_000 });

    // Sabato alle 08:00 il lead è nella lista di Oggi con la stessa scadenza della tabella e della scheda.
    const o = (await (await call(`/api/today?chi=tutte&now=${SCADENZA - 3_600_000}`, {}, cookie)).json()) as Oggi;
    expect(o.righe.find((l) => l.id === "notturno")?.prossima.scadenza).toBe(SCADENZA);

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
    const atteso = scadenzaLavorativa(lead.createdAt, 30, ORARIO_DEFAULT);
    expect(lead.nextActionAt).toBe(atteso);
    const salvato = await env.DB.prepare("SELECT next_action_at n FROM leads WHERE id = ?").bind(lead.id).first<{ n: number }>();
    expect(salvato?.n).toBe(atteso);
  });
});

describe("Oggi: ogni lead una volta sola, un solo conteggio", () => {
  it("un lead con call oggi e azione scaduta compare una riga sola; titolo e badge uguali", async () => {
    const cookie = await authed();
    const ora = Date.now();
    await insertLead("scaduto", { next_action_at: ora - 2 * GIORNO, stage_changed_at: ora - 9 * GIORNO, created_at: ora - 10 * GIORNO });
    await insertLead("altro", { next_action_at: ora - 60_000, stage_changed_at: ora - GIORNO, created_at: ora - 2 * GIORNO });
    await insertLead("con-call", { stage_id: "appuntamento-confermato", next_action: "Call di conoscenza", next_action_at: ora + 20 * 60_000, stage_changed_at: ora - GIORNO, created_at: ora - 2 * GIORNO });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k1', 'con-call', 'conoscenza', ?, ?, ?)").bind(ora + 20 * 60_000, ora, ora).run();

    const o = (await (await call("/api/today?chi=mie", {}, cookie)).json()) as Oggi;
    const ids = o.righe.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("scaduto");
    expect(o.totale).toBe(o.righe.length);
    const badge = (await (await call("/api/badge", {}, cookie)).json()) as { commerciale: number };
    expect(badge.commerciale).toBe(o.totale);
    expect(badge.commerciale).toBeGreaterThanOrEqual(2);
  });
});
