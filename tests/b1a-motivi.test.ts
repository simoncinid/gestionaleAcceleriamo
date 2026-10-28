import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { controllaAvvisi } from "../worker/avvisi/controlli";
import { IMPOSTAZIONI_DEFAULT } from "../worker/impostazioni/default";
import { MOTIVI_PERSI, etichettaMotivo } from "../worker/processo/motivi";
import { authed, call } from "./helpers";

// Blocco 1, modifica 7 (parte worker): motivi persi con codice fisso, obbligatori per andare in 80.
const NOW = Date.now();
const GIORNO = 86_400_000;
async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: "Officina Prova", contact_name: "Luca Prova", source: "manuale", stage_id: "in-attesa-decisione", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, next_action: "Follow-up", next_action_at: NOW + GIORNO, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}
const leggi = (id: string) => env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first<Record<string, unknown>>();
const chiudi = (id: string, json: Record<string, unknown>, cookie: string) => call(`/api/leads/${id}`, { method: "PATCH", json: { stageId: "non-chiuso", ...json } }, cookie);

describe("motivi persi: lista fissa", () => {
  it("il default delle Impostazioni è la lista con codice", () => {
    expect(IMPOSTAZIONI_DEFAULT.motivi).toEqual(MOTIVI_PERSI.map((m) => ({ id: m.id, etichetta: m.etichetta })));
  });

  it("una lista vecchia salvata diventa la lista fissa, con le etichette rinominate che valgono", async () => {
    const cookie = await authed();
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('motivi', ?, ?)")
      .bind(JSON.stringify([{ id: "budget", etichetta: "Budget" }, { id: "altro", etichetta: "Altro motivo" }]), NOW).run();
    const imp = (await (await call("/api/settings", {}, cookie)).json()) as { motivi: { id: string; etichetta: string }[] };
    expect(imp.motivi.map((m) => m.id)).toEqual(MOTIVI_PERSI.map((m) => m.id));
    expect(imp.motivi.find((m) => m.id === "altro")?.etichetta).toBe("Altro motivo");
  });

  it("le etichette si rinominano, i codici no", async () => {
    const cookie = await authed();
    const rinominati = MOTIVI_PERSI.map((m) => ({ id: m.id, etichetta: m.id === "prezzo" ? "Costa troppo" : m.etichetta }));
    expect((await call("/api/settings", { method: "PUT", json: { key: "motivi", value: rinominati } }, cookie)).status).toBe(200);
    const nuovo = [...rinominati, { id: "motivo_nuovo", etichetta: "Nuovo" }];
    expect((await call("/api/settings", { method: "PUT", json: { key: "motivi", value: nuovo } }, cookie)).status).toBe(422);
  });

  it("i vecchi codici dei lead già chiusi restano leggibili", () => {
    expect(etichettaMotivo("non_interessato")).toBe("Non interessato");
    expect(etichettaMotivo("prezzo")).toBe("Troppo caro");
    expect(etichettaMotivo("sconosciuto")).toBe("sconosciuto");
  });
});

describe("andare in 80", () => {
  it("senza motivo o con un codice vecchio: 422", async () => {
    const cookie = await authed();
    await insertLead("m1");
    expect((await chiudi("m1", {}, cookie)).status).toBe(422);
    expect((await chiudi("m1", { lostReason: "budget" }, cookie)).status).toBe(422);
    const ok = await chiudi("m1", { lostReason: "prezzo" }, cookie);
    expect(ok.status).toBe(200);
    expect(await leggi("m1")).toMatchObject({ stage_id: "non-chiuso", lost_reason: "prezzo" });
  });

  it("non_ora chiede la data di ricontatto e quel giorno il lead torna in 10 con nota", async () => {
    const cookie = await authed();
    await insertLead("m2");
    const r1 = await chiudi("m2", { lostReason: "non_ora" }, cookie);
    expect(r1.status).toBe(422);
    expect(((await r1.json()) as { error: string }).error).toBe("Scegli il giorno in cui risentirlo");
    const quando = NOW + 30 * GIORNO;
    expect((await chiudi("m2", { lostReason: "non_ora", recontactAt: quando }, cookie)).status).toBe(200);
    expect(await leggi("m2")).toMatchObject({ stage_id: "non-chiuso", lost_reason: "non_ora", paused_until: quando });
    await controllaAvvisi(env, quando + 1000, 12);
    expect(await leggi("m2")).toMatchObject({ stage_id: "da-chiamare-prima-volta", paused_until: null, next_action: "Prima chiamata" });
    const note = await env.DB.prepare("SELECT body FROM activities WHERE lead_id = 'm2' AND type = 'nota' ORDER BY created_at").all<{ body: string }>();
    expect(note.results.map((n) => n.body)).toEqual([expect.stringMatching(/^Motivo: Non è il momento\. Da risentire /), 'Riaperto: era "Non è il momento", oggi è il giorno per risentirlo']);
  });

  it("altro chiede il testo, che finisce nello storico", async () => {
    const cookie = await authed();
    await insertLead("m3");
    expect((await chiudi("m3", { lostReason: "altro" }, cookie)).status).toBe(422);
    expect((await chiudi("m3", { lostReason: "altro", lostNote: "Ha chiuso l'attività" }, cookie)).status).toBe(200);
    const storia = await env.DB.prepare("SELECT body FROM activities WHERE lead_id = 'm3' AND type = 'nota'").first<{ body: string }>();
    expect(storia?.body).toBe("Motivo: Altro. Ha chiuso l'attività");
  });
});
