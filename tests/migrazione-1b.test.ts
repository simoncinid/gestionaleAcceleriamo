import { describe, expect, it } from "vitest";
import { applyD1Migrations, env } from "cloudflare:test";
import { AZIENDA_SQL } from "../worker/lib/azienda";

const NOW = 1_800_000_000_000;

async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: id, source: "manuale", stage_id: "da-richiamare", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}

describe("migrazioni del Piano A", () => {
  it("le fasi hanno probabilità, azione proposta e motivo obbligatorio solo per le perse", async () => {
    const { results } = await env.DB.prepare("SELECT id, probability, suggested_next_action, requires_reason FROM stages ORDER BY sort_order").all<{ id: string; probability: number; suggested_next_action: string | null; requires_reason: number }>();
    // Stato finale, dopo la 0020 che ha aggiunto le tre fasi di analisi e progetto.
    expect(results).toHaveLength(12);
    expect(results.find((s) => s.id === "da-chiamare-prima-volta")).toMatchObject({ probability: 10, suggested_next_action: "Prima chiamata", requires_reason: 0 });
    expect(results.filter((s) => s.requires_reason === 1).map((s) => s.id)).toEqual(["non-chiuso", "fake"]);
    const aperte = results.slice(0, 9).map((s) => s.probability);
    expect(Math.min(...aperte)).toBe(10);
    expect(Math.max(...aperte)).toBe(80);
  });

  it("scrive la mappa regola e fase di partenza", async () => {
    const { results } = await env.DB.prepare("SELECT rule_key, stage_id, event, params, active FROM stage_rules ORDER BY rule_key, stage_id").all<{ rule_key: string; stage_id: string | null; event: string | null; params: string; active: number }>();
    expect(results.map((r) => `${r.rule_key}:${r.stage_id ?? r.event ?? "tutte"}`)).toEqual([
      "fermo:tutte", "pausa:in-attesa-decisione", "preventivo_48h:call_conoscenza_fatta", "ricontatti:in-attesa-decisione",
      "sla:da-chiamare-prima-volta", "tentativi:da-richiamare",
    ]);
    expect(JSON.parse(results.find((r) => r.rule_key === "sla")!.params)).toEqual({ minuti: 30, avvisoMinuti: 20 }); // la 0018 (blocco 1) porta la prima chiamata a 30 minuti
    expect(results.every((r) => r.active === 1)).toBe(true);
  });

  it("modelli di partenza e stato del foglio", async () => {
    const { results } = await env.DB.prepare("SELECT key, channel FROM message_templates ORDER BY sort_order").all<{ key: string; channel: string }>();
    expect(results).toHaveLength(8);
    expect(results.find((t) => t.key === "conferma")?.channel).toBe("email");
    const foglio = await env.DB.prepare("SELECT last_row FROM sheet_sync_state WHERE id = 'foglio-andrea'").first<{ last_row: number }>();
    expect(foglio?.last_row).toBe(1);
  });

  it("porta call e proposte della 1A nelle tabelle nuove", async () => {
    await insertLead("conosc", { appointment_at: NOW + 1000, meet_link: "https://meet.google.com/a" });
    await insertLead("present", { appointment_at: NOW + 2000, stage_id: "presentazione-confermata" });
    await insertLead("propo", { proposal_url: "https://drive.google.com/x", stage_id: "in-attesa-decisione" });
    await insertLead("nulla");
    await insertLead("cestinato", { appointment_at: NOW + 3000, proposal_url: "https://drive.google.com/y", deleted_at: NOW });
    const mig = env.TEST_MIGRATIONS.find((m) => m.name.startsWith("0004"))!;
    for (const q of mig.queries.filter((q) => /INSERT INTO (calls|proposals)/.test(q))) await env.DB.prepare(q).run();

    const calls = await env.DB.prepare("SELECT lead_id, kind, scheduled_at, meet_link FROM calls ORDER BY lead_id").all<{ lead_id: string; kind: string; scheduled_at: number; meet_link: string | null }>();
    expect(calls.results).toEqual([
      { lead_id: "conosc", kind: "conoscenza", scheduled_at: NOW + 1000, meet_link: "https://meet.google.com/a" },
      { lead_id: "present", kind: "presentazione", scheduled_at: NOW + 2000, meet_link: null },
    ]);
    const prop = await env.DB.prepare("SELECT lead_id, number, status, registered_via, pdf_url, setup_cents FROM proposals").all();
    expect(prop.results).toEqual([{ lead_id: "propo", number: "1A-propo", status: "registrata", registered_via: "migrazione", pdf_url: "https://drive.google.com/x", setup_cents: null }]);
  });

  it("requestId delle attività è unico", async () => {
    await insertLead("x");
    const ins = "INSERT INTO activities (id, lead_id, type, body, created_at, request_id) VALUES (?, 'x', 'esito', '', 1, 'r1')";
    await env.DB.prepare(ins).bind("a1").run();
    await expect(env.DB.prepare(ins).bind("a2").run()).rejects.toThrow(/UNIQUE/);
  });

  it("il numero della proposta portata usa l'id intero, anche con prefissi uguali", async () => {
    await insertLead("stesso-prefisso-a", { proposal_url: "https://drive.google.com/a" });
    await insertLead("stesso-prefisso-b", { proposal_url: "https://drive.google.com/b" });
    const mig = env.TEST_MIGRATIONS.find((m) => m.name.startsWith("0004"))!;
    for (const q of mig.queries.filter((q) => /INSERT INTO proposals/.test(q))) await env.DB.prepare(q).run();
    const { results } = await env.DB.prepare("SELECT number FROM proposals ORDER BY number").all<{ number: string }>();
    expect(results.map((r) => r.number)).toEqual(["1A-stesso-prefisso-a", "1A-stesso-prefisso-b"]);
  });

  it("le migrazioni solo aggiungono: nessun DROP né ricostruzione di tabelle", () => {
    // Dalla 0003 in poi (prima release con dati veri), comprese 0005, 0006, 0007, 0008 e 0012.
    const dopo = env.TEST_MIGRATIONS.filter((m) => Number.parseInt(m.name, 10) >= 3);
    expect(dopo.map((m) => m.name.slice(0, 4))).toEqual(expect.arrayContaining(["0005", "0006", "0007", "0008", "0009", "0012"]));
    for (const m of dopo) {
      const sql = m.queries.join("\n");
      expect(sql).not.toMatch(/\bDROP\b/i);
      expect(sql).not.toMatch(/__new_/);
    }
  });

  it("i modelli di partenza usano il nome del referente", async () => {
    const { results } = await env.DB.prepare("SELECT key, body FROM message_templates").all<{ key: string; body: string }>();
    for (const t of results) expect(t.body, t.key).toContain("{referente}");
  });

  it("ogni aggiornamento delle fasi ha colpito la sua riga", async () => {
    const { results } = await env.DB.prepare("SELECT id, probability, suggested_next_action AS azione, suggested_delay_hours AS ore FROM stages").all<{ id: string; probability: number; azione: string | null; ore: number | null }>();
    const attese: Record<string, [number, string | null, number | null]> = {
      "da-chiamare-prima-volta": [10, "Prima chiamata", 0],
      "da-richiamare": [15, "Richiamare", 24],
      "appuntamento-confermato": [30, "Call di conoscenza", null],
      "presentazione-confermata": [55, "Call dell'offerta", null],
      "in-attesa-preventivo": [45, "Preparare l'offerta", null],
      "analisi-fissata": [60, "Call di analisi", null],
      "in-attesa-progetto": [65, "Preparare il progetto", null],
      "progetto-fissato": [70, "Call del progetto", null],
      "in-attesa-decisione": [80, "Follow-up preventivo", 72],
      chiuso: [100, null, null],
    };
    for (const [id, [prob, azione, ore]] of Object.entries(attese)) {
      expect(results.find((s) => s.id === id), id).toMatchObject({ probability: prob, azione, ore });
    }
  });

  it("le righe della 1A restano intatte e prendono i valori di partenza", async () => {
    const all = env.TEST_MIGRATIONS;
    const prima = all.filter((m) => /^000[012]/.test(m.name));
    const db = (env as unknown as { DB_PRE: D1Database }).DB_PRE;
    await applyD1Migrations(db, prima);
    await db.prepare("INSERT INTO leads (id, company, source, stage_id, stage_changed_at, created_at, updated_at, notes) VALUES ('vecchio', 'Vecchia Srl', 'meta', 'da-richiamare', 5, 6, 7, 'nota 1A')").run();
    await db.prepare("INSERT INTO activities (id, lead_id, type, body, created_at) VALUES ('att1', 'vecchio', 'nota', 'testo 1A', 8)").run();

    await applyD1Migrations(db, all);

    const lead = await db.prepare("SELECT company, source, stage_id, stage_changed_at, created_at, updated_at, notes, attempt_count, confirmation_attempts, sequence_step, lost_reason FROM leads WHERE id = 'vecchio'").first();
    expect(lead).toEqual({ company: "Vecchia Srl", source: "meta", stage_id: "da-richiamare", stage_changed_at: 5, created_at: 6, updated_at: 7, notes: "nota 1A", attempt_count: 0, confirmation_attempts: 0, sequence_step: 0, lost_reason: null });
    const att = await db.prepare("SELECT type, body, created_at, request_id, outcome FROM activities WHERE id = 'att1'").first();
    expect(att).toEqual({ type: "nota", body: "testo 1A", created_at: 8, request_id: null, outcome: null });
    const stages = await db.prepare("SELECT COUNT(*) AS n, SUM(requires_reason) AS motivo FROM stages").first<{ n: number; motivo: number }>();
    expect(stages).toEqual({ n: 12, motivo: 2 });
  });
});

describe("migrazione 0016: fasi del processo di vendita", () => {
  it("porta i lead delle fasi tolte nelle nuove senza perdere dati, con una voce nello storico", async () => {
    const all = env.TEST_MIGRATIONS;
    const db = (env as unknown as { DB_PRE: D1Database }).DB_PRE;
    await applyD1Migrations(db, all.filter((m) => !m.name.startsWith("0016")));
    await db.prepare("INSERT INTO users (id, username, name, password_hash, active, created_at) VALUES ('u-diego', 'diego.simoncini', 'Diego', 'x', 1, 1), ('u-tom', 'tommaso.rovini', 'Tommaso', 'x', 1, 1)").run();
    const lead = (id: string, fase: string, extra = "NULL, NULL, NULL") =>
      db.prepare(`INSERT INTO leads (id, company, source, stage_id, stage_changed_at, created_at, updated_at, notes, owner_id, paused_until, lost_reason) VALUES ('${id}', 'Azienda ${id}', 'meta', '${fase}', 5, 6, 7, 'nota ${id}', ${extra})`).run();
    await lead("a", "non-chiamato");
    await lead("b", "probabilmente-bloccato", "'u-tom', 999, NULL");
    await lead("c", "fuori-target");
    await lead("d", "fake", "NULL, NULL, 'fake'");
    await lead("e", "da-chiamare-prima-volta");
    await lead("f", "presentazione-confermata", "'u-tom', NULL, NULL");
    await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('assegnazione', '{\"primaChiamata\":\"u-tom\",\"presentazione\":\"u-diego\",\"proposta\":\"u-diego\",\"via\":{\"utente\":null,\"fino\":null}}', 1)").run();

    await applyD1Migrations(db, all);

    const righe = (await db.prepare("SELECT id, stage_id, notes, owner_id, paused_until, lost_reason, stage_changed_at FROM leads ORDER BY id").all()).results;
    expect(righe).toEqual([
      { id: "a", stage_id: "da-richiamare", notes: "nota a", owner_id: "u-diego", paused_until: null, lost_reason: null, stage_changed_at: 5 },
      { id: "b", stage_id: "in-attesa-decisione", notes: "nota b", owner_id: "u-tom", paused_until: 999, lost_reason: null, stage_changed_at: 5 },
      { id: "c", stage_id: "fake", notes: "nota c", owner_id: null, paused_until: null, lost_reason: "fuori_target", stage_changed_at: 5 },
      { id: "d", stage_id: "fake", notes: "nota d", owner_id: null, paused_until: null, lost_reason: "fake", stage_changed_at: 5 },
      { id: "e", stage_id: "da-chiamare-prima-volta", notes: "nota e", owner_id: "u-diego", paused_until: null, lost_reason: null, stage_changed_at: 5 },
      { id: "f", stage_id: "presentazione-confermata", notes: "nota f", owner_id: "u-tom", paused_until: null, lost_reason: null, stage_changed_at: 5 },
    ]);
    const storico = (await db.prepare("SELECT lead_id, body FROM activities WHERE type = 'cambio_fase' ORDER BY lead_id").all<{ lead_id: string; body: string }>()).results;
    expect(storico).toEqual([
      { lead_id: "a", body: 'Da "Non chiamato" a "Da richiamare" (fasi riordinate il 26/10/2026)' },
      { lead_id: "b", body: 'Da "Probabilmente bloccato" a "In attesa decisione" (fasi riordinate il 26/10/2026)' },
      { lead_id: "c", body: 'Da "Fuori target" a "Non profilato" (fasi riordinate il 26/10/2026)' },
    ]);
    const imp = await db.prepare("SELECT value FROM settings WHERE key = 'assegnazione'").first<{ value: string }>();
    expect(JSON.parse(imp!.value)).toMatchObject({ primaChiamata: "u-diego", presentazione: "u-diego" });
  });
});

describe("migrazione 0012: indici", () => {
  it("l'indice del doppione per azienda usa la stessa espressione della query", () => {
    const m = env.TEST_MIGRATIONS.find((x) => x.name.startsWith("0012"))!;
    expect(m.queries.join("\n")).toContain(`ON \`leads\` (${AZIENDA_SQL}) WHERE deleted_at IS NULL`);
  });

  it("un lead ha al massimo un cliente vivo; uno nel cestino non conta", async () => {
    await env.DB.prepare("INSERT INTO clients (id, name, origin_lead_id, created_at) VALUES ('C1', 'Uno', 'L1', 0)").run();
    await expect(env.DB.prepare("INSERT INTO clients (id, name, origin_lead_id, created_at) VALUES ('C2', 'Due', 'L1', 0)").run()).rejects.toThrow(/UNIQUE/);
    await env.DB.prepare("UPDATE clients SET deleted_at = 1 WHERE id = 'C1'").run();
    await env.DB.prepare("INSERT INTO clients (id, name, origin_lead_id, created_at) VALUES ('C3', 'Tre', 'L1', 0)").run();
    await env.DB.prepare("INSERT INTO clients (id, name, created_at) VALUES ('C4', 'Senza lead', 0), ('C5', 'Senza lead', 0)").run();
  });
});
