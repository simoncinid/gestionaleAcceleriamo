import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { daRoma } from "../worker/lib/roma";
import { AZIONE_RIFISSARE, AZIONE_RIPROVARE, prossimaAzione } from "../worker/processo/processo";
import { transizione } from "../worker/processo/transizione";
import { CONTESTO_BASE, type Contesto } from "../worker/regole/motore";
import { authed, call } from "./helpers";

// Blocco 1, modifica 3: no-show con fase che resta, contatore, seconda assenza in pausa.
const ORA = daRoma(2026, 10, 28, 11, 0); // mercoledì
const ctx = (extra: Partial<Contesto> = {}): Contesto => ({ ...CONTESTO_BASE, ora: ORA, ...extra });
const base = { stageId: "appuntamento-confermato", attemptCount: 2, primoTentativoAt: null, noShow: 0, pausedUntil: null };

describe("transizione: no_show", () => {
  it("prima assenza: fase invariata, Rifissare entro 2 ore lavorative, noShow + 1, tentativi invariati", () => {
    const p = transizione(base, { tipo: "no_show" }, ctx());
    expect(p).toMatchObject({ stageId: null, nextAction: AZIONE_RIFISSARE, nextActionAt: ORA + 2 * 3_600_000, noShow: 1 });
    expect(p.attemptCount).toBeUndefined();
  });

  it("prima assenza a fine giornata: le 2 ore scavalcano la notte", () => {
    const sera = daRoma(2026, 10, 28, 19, 0);
    expect(transizione(base, { tipo: "no_show" }, ctx({ ora: sera })).nextActionAt).toBe(daRoma(2026, 10, 29, 10, 0));
  });

  it("seconda assenza: pausa di 2 mesi con Riprovare", () => {
    const p = transizione({ ...base, noShow: 1 }, { tipo: "no_show" }, ctx());
    expect(p).toMatchObject({ stageId: null, nextAction: AZIONE_RIPROVARE, noShow: 2 });
    expect(p.pausedUntil).toBe(daRoma(2026, 12, 28, 10, 0));
    expect(p.nextActionAt).toBe(p.pausedUntil);
  });

  it("dopo la pausa una chiamata a vuoto in 30 o 50 con due assenze porta in 80 con motivo no_show", () => {
    for (const stageId of ["appuntamento-confermato", "presentazione-confermata"]) {
      for (const esito of ["non_risponde", "occupato"] as const) {
        expect(transizione({ ...base, stageId, noShow: 2 }, { tipo: "esito", esito }, ctx()), `${stageId} ${esito}`)
          .toMatchObject({ stageId: "non-chiuso", lostReason: "no_show", nextAction: null, nextActionAt: null });
      }
    }
  });

  it("durante la pausa una chiamata a vuoto non chiude il lead", () => {
    const p = transizione({ ...base, noShow: 2, pausedUntil: ORA + 86_400_000 }, { tipo: "esito", esito: "non_risponde" }, ctx());
    expect(p.stageId).not.toBe("non-chiuso");
  });
});

describe("prossimaAzione dopo il no-show", () => {
  const lead = { stageId: "appuntamento-confermato", company: "Officina", contactName: "Marco Rossi", createdAt: ORA, stageChangedAt: ORA, attemptCount: 0 };
  it("fine pausa: Ultima chiamata con Chiama", () => {
    const p = prossimaAzione({ ...lead, nextAction: AZIONE_RIPROVARE, nextActionAt: ORA, pausedUntil: null, noShow: 2 }, ORA);
    expect(p.azione).toBe("Ultima chiamata dopo la pausa");
    expect(p.pulsante?.codice).toBe("chiama");
  });
});

const NOW = Date.now();
async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: "Officina Prova", contact_name: "Luca Prova", email: "luca@esempio.it", phone: "+393330000001", source: "manuale", stage_id: "appuntamento-confermato", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, next_action: "Call di conoscenza", next_action_at: NOW - 600_000, attempt_count: 2, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}
const insertCall = (id: string, leadId: string, kind = "conoscenza") =>
  env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, leadId, kind, NOW - 600_000, NOW, NOW).run();
const leggi = (id: string) => env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first<Record<string, unknown>>();
type Risposta = { lead: { stageId: string; noShow: number; prossima: { azione: string; stato: string } } };

describe("POST /api/leads/:id/no-show", () => {
  it("prima volta: fase che resta, Rifissare la consulenza entro oggi, call chiusa come saltata, storico", async () => {
    const cookie = await authed();
    await insertLead("ns1");
    await insertCall("kns1", "ns1");
    const r = await call("/api/leads/ns1/no-show", { method: "POST", json: { kind: "conoscenza" } }, cookie);
    expect(r.status).toBe(200);
    const { lead } = (await r.json()) as Risposta;
    expect(lead).toMatchObject({ stageId: "appuntamento-confermato", noShow: 1 });
    expect(lead.prossima.azione).toBe("Rifissare la consulenza");
    expect(await leggi("ns1")).toMatchObject({ attempt_count: 2, next_action: AZIONE_RIFISSARE });
    expect(await env.DB.prepare("SELECT outcome FROM calls WHERE id = 'kns1'").first()).toEqual({ outcome: "saltata" });
    const storia = await env.DB.prepare("SELECT body FROM activities WHERE lead_id = 'ns1' AND type = 'call'").first<{ body: string }>();
    expect(storia?.body).toBe("Non si è presentato alla consulenza (prima volta)");
  });

  it("seconda volta: Riprovare il <data fra 2 mesi>", async () => {
    const cookie = await authed();
    await insertLead("ns2", { stage_id: "presentazione-confermata", no_show: 1 });
    const r = await call("/api/leads/ns2/no-show", { method: "POST", json: { kind: "presentazione" } }, cookie);
    const { lead } = (await r.json()) as Risposta;
    expect(lead.noShow).toBe(2);
    expect(lead.prossima.azione).toMatch(/^Riprovare il /);
    expect((await leggi("ns2"))?.paused_until).toBeTypeOf("number");
  });

  it("422 se la call non è quella della fase", async () => {
    const cookie = await authed();
    await insertLead("ns3", { stage_id: "da-richiamare" });
    const r = await call("/api/leads/ns3/no-show", { method: "POST", json: { kind: "conoscenza" } }, cookie);
    expect(r.status).toBe(422);
  });

  it("la call segnata saltata dalla pagina Call passa dalla stessa regola", async () => {
    const cookie = await authed();
    await insertLead("ns4");
    await insertCall("kns4", "ns4");
    await call("/api/calls/kns4", { method: "PATCH", json: { outcome: "saltata" } }, cookie);
    expect(await leggi("ns4")).toMatchObject({ stage_id: "appuntamento-confermato", next_action: AZIONE_RIFISSARE, no_show: 1, attempt_count: 2 });
  });
});
