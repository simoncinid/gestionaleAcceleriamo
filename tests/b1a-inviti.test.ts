import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { authed, call } from "./helpers";
import { ICS_GOOGLE } from "./fixtures/posta";

// Blocco 1, modifica 12 (ipotesi 10): l'invito di Google accettato o spostato aggiorna la call ma non la fase;
// la fase cambia solo quando una persona conferma la proposta.
const NOW = Date.now();
const ALLE_10 = Date.UTC(2026, 10, 5, 9, 0);
async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: "Officina Rossi Finta", source: "meta", stage_id: "da-chiamare-prima-volta", email_norm: "mario@officina-rossi-finta.it", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, next_action: "Prima chiamata", next_action_at: NOW, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}
let n = 0;
const posta = (calendario: string) => call("/api/hooks/posta", {
  method: "POST",
  json: { messageId: `<inv-${++n}@prova.it>`, data: NOW, da: { email: "calendar-notification@google.com", nome: "Google Calendar" }, oggetto: "", testo: "", calendario },
  headers: { authorization: "Bearer chiave-posta-test" },
});
const lead = (id: string) => env.DB.prepare("SELECT stage_id, next_action, next_action_at FROM leads WHERE id = ?").bind(id).first<Record<string, unknown>>();
const proposte = (id: string) => env.DB.prepare("SELECT id, body, outcome FROM activities WHERE lead_id = ? AND type = 'invito_proposta' ORDER BY created_at, rowid").bind(id).all<{ id: string; body: string; outcome: string }>().then((r) => r.results);
const conferma = (id: string, attivita: string, cookie: string) => call(`/api/leads/${id}/inviti/${attivita}/conferma`, { method: "POST" }, cookie);

describe("inviti del calendario come proposta", () => {
  it("invito accettato: call creata, fase ferma; alla conferma il lead va in 30 con la call", async () => {
    const cookie = await authed();
    await insertLead("i1");
    expect((await posta(ICS_GOOGLE())).status).toBe(201);
    expect(await lead("i1")).toMatchObject({ stage_id: "da-chiamare-prima-volta", next_action: "Prima chiamata" });
    const [p] = await proposte("i1");
    expect(p).toMatchObject({ outcome: "da_confermare", body: expect.stringContaining("Il cliente ha accettato la call di") });

    const r = await conferma("i1", p.id, cookie);
    expect(r.status).toBe(200);
    expect(await lead("i1")).toMatchObject({ stage_id: "appuntamento-confermato", next_action: "Call di conoscenza", next_action_at: ALLE_10 });
    expect((await proposte("i1"))[0].outcome).toBe("confermata");
    // Una seconda conferma non riapplica niente.
    expect((await conferma("i1", p.id, cookie)).status).toBe(409);
  });

  it("invito spostato: la call si sposta subito, la proposta chiede di confermare la data nuova", async () => {
    const cookie = await authed();
    await insertLead("i2");
    await posta(ICS_GOOGLE());
    await conferma("i2", (await proposte("i2"))[0].id, cookie);
    await posta(ICS_GOOGLE({ seq: 2, inizio: "20261106T153000", fine: "20261106T163000" }));
    const nuova = Date.UTC(2026, 10, 6, 14, 30);
    expect(await env.DB.prepare("SELECT scheduled_at FROM calls WHERE lead_id = 'i2'").first("scheduled_at")).toBe(nuova);
    // La prossima azione resta quella confermata finché una persona non conferma lo spostamento.
    expect(await lead("i2")).toMatchObject({ next_action_at: ALLE_10 });
    const ultima = (await proposte("i2"))[1];
    expect(ultima).toMatchObject({ outcome: "da_confermare", body: expect.stringContaining("Il cliente ha chiesto di spostare la call a") });
    expect((await conferma("i2", ultima.id, cookie)).status).toBe(200);
    expect(await lead("i2")).toMatchObject({ stage_id: "appuntamento-confermato", next_action_at: nuova });
  });

  it("proposta di un altro lead o inesistente: 404", async () => {
    const cookie = await authed();
    await insertLead("i3");
    await insertLead("i4", { email_norm: "altro@prova.it" });
    await posta(ICS_GOOGLE());
    const [p] = await proposte("i3");
    expect((await conferma("i4", p.id, cookie)).status).toBe(404);
    expect((await conferma("i3", "inesistente", cookie)).status).toBe(404);
  });

  it("doppio clic: la conferma si applica una volta sola, la seconda risponde 409", async () => {
    const cookie = await authed();
    await insertLead("i5");
    await posta(ICS_GOOGLE());
    const [p] = await proposte("i5");
    const stati = (await Promise.all([conferma("i5", p.id, cookie), conferma("i5", p.id, cookie)])).map((r) => r.status).sort();
    expect(stati).toEqual([200, 409]);
    const cambi = await env.DB.prepare("SELECT id FROM activities WHERE lead_id = 'i5' AND type = 'cambio_fase'").all();
    expect(cambi.results.length).toBeLessThanOrEqual(1);
    expect(await lead("i5")).toMatchObject({ stage_id: "appuntamento-confermato" });
  });

  it("lead nel cestino: la proposta non si conferma", async () => {
    const cookie = await authed();
    await insertLead("i6");
    await posta(ICS_GOOGLE());
    const [p] = await proposte("i6");
    await env.DB.prepare("UPDATE leads SET deleted_at = ? WHERE id = 'i6'").bind(NOW).run();
    expect((await conferma("i6", p.id, cookie)).status).toBe(404);
    expect(await lead("i6")).toMatchObject({ stage_id: "da-chiamare-prima-volta" });
  });
});
