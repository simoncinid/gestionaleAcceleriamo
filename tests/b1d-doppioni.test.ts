import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { computeMetaSignature } from "../worker/meta/signature";
import { setMetaFetch } from "../worker/meta/fetcher";
import { getDb } from "../worker/db/client";
import { ingressoLead } from "../worker/leads/service";
import { authed, call } from "./helpers";

// Blocco 1, modifica 8: doppioni all'ingresso (contratto, sezione 7). Chiave: telefono normalizzato oppure email minuscola.
const NOW = Date.UTC(2026, 9, 15, 9);
const righe = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).all<Record<string, unknown>>().then((r) => r.results);
const contaLead = async () => (await righe("SELECT id FROM leads")).length;
const storico = async (id: string) => (await righe("SELECT body FROM activities WHERE lead_id = ? ORDER BY created_at", id)).map((a) => String(a.body));

async function inserisci(id: string, stageId: string, extra: { phone?: string; email?: string; deleted?: boolean; score?: string; lostReason?: string } = {}) {
  const tel = extra.phone ?? null;
  const norm = tel ? tel.replace(/\D/g, "").replace(/^39/, "") : null;
  await env.DB.prepare(`INSERT INTO leads (id, company, phone, phone_norm, email, email_norm, source, stage_id, stage_changed_at, next_action, next_action_at, score, lost_reason, attempt_count, created_at, updated_at, deleted_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'meta', ?7, ?8, ?9, ?8, ?10, ?11, 2, ?8, ?8, ?12)`)
    .bind(id, `Azienda ${id}`, tel, norm, extra.email ?? null, extra.email?.toLowerCase() ?? null, stageId, NOW - 86_400_000,
      ["non-chiuso", "fake", "chiuso"].includes(stageId) ? null : "Richiamare", extra.score ?? "grigio", extra.lostReason ?? null, extra.deleted ? NOW : null)
    .run();
}

describe("lead a mano con un doppione", () => {
  it("telefono di un lead aperto: 409 con l'esistente e nessuna riga nuova", async () => {
    const cookie = await authed();
    await inserisci("aperto", "da-richiamare", { phone: "+39 333 111 2222" });
    const r = await call("/api/leads", { method: "POST", json: { company: "Altro nome", phone: "0039 333-111.2222" } }, cookie);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ esistente: { id: "aperto", company: "Azienda aperto" } });
    expect(await contaLead()).toBe(1);
    expect(await righe("SELECT id FROM activities")).toHaveLength(0);
  });

  it("email con le maiuscole di un lead aperto: 409", async () => {
    const cookie = await authed();
    await inserisci("aperto", "in-attesa-decisione", { email: "mario@rossi-finto.it" });
    const r = await call("/api/leads", { method: "POST", json: { company: "Rossi", email: "Mario@Rossi-Finto.it" } }, cookie);
    expect(r.status).toBe(409);
    expect(await contaLead()).toBe(1);
  });

  it("lead in 80: si riapre in 10 con la nota, stesso id, niente lead nuovo", async () => {
    const cookie = await authed();
    await inserisci("perso", "non-chiuso", { phone: "333 111 2222", lostReason: "prezzo" });
    const r = await call("/api/leads", { method: "POST", json: { company: "Di nuovo", phone: "3331112222" } }, cookie);
    expect(r.status).toBe(200);
    const { lead, riaperto } = (await r.json()) as { lead: { id: string; stageId: string; lostReason: string | null; attemptCount: number; nextActionAt: number | null }; riaperto: boolean };
    expect(riaperto).toBe(true);
    expect(lead).toMatchObject({ id: "perso", stageId: "da-chiamare-prima-volta", lostReason: null, attemptCount: 0 });
    expect(lead.nextActionAt).not.toBeNull();
    expect(await contaLead()).toBe(1);
    expect((await storico("perso")).join("\n")).toMatch(/Riaperto: arrivato di nuovo da A mano/);
  });

  it("lead in 90 o nel cestino: nasce il nuovo con l'avviso Possibile doppione", async () => {
    const cookie = await authed();
    await inserisci("finto", "fake", { phone: "333 111 2222" });
    await inserisci("cestinato", "da-richiamare", { phone: "333 444 5555", deleted: true });
    const a = await call("/api/leads", { method: "POST", json: { company: "Nuovo A", phone: "333 111 2222" } }, cookie);
    const b = await call("/api/leads", { method: "POST", json: { company: "Nuovo B", phone: "333 444 5555" } }, cookie);
    expect([a.status, b.status]).toEqual([201, 201]);
    const la = ((await a.json()) as { lead: { id: string; duplicateOfId: string } }).lead;
    const lb = ((await b.json()) as { lead: { id: string; duplicateOfId: string } }).lead;
    expect(la.duplicateOfId).toBe("finto");
    expect(lb.duplicateOfId).toBe("cestinato");
    expect((await storico(la.id)).join("\n")).toContain("Possibile doppione di Azienda finto");
    expect((await storico(lb.id)).join("\n")).toContain("Possibile doppione di Azienda cestinato (nel cestino)");
  });
});

describe("ingresso automatico (stessa regola per Meta, modulo del sito e CSV)", () => {
  it("lead aperto: niente lead nuovo, storico 'Arrivato di nuovo da', punteggio alzato", async () => {
    await inserisci("aperto", "appuntamento-confermato", { phone: "333 111 2222", score: "grigio" });
    const r = await ingressoLead(getDb(env.DB), { company: "X", phone: "+39 333 1112222", source: "sito" }, "modulo del sito", null, NOW);
    expect(r.esito).toBe("arrivato_di_nuovo");
    expect(r.lead.id).toBe("aperto");
    expect(r.lead.stageId).toBe("appuntamento-confermato");
    expect(r.lead.score).toBe("giallo");
    expect(await storico("aperto")).toContain("Arrivato di nuovo da modulo del sito");
    expect(await contaLead()).toBe(1);
  });
});

describe("Meta", () => {
  afterEach(() => setMetaFetch(null));
  async function webhook(leadgenId: string, fields: Record<string, string>) {
    setMetaFetch(async () => Response.json({ field_data: Object.entries(fields).map(([name, v]) => ({ name, values: [v] })), campaign_name: "C", form_id: "f" }));
    const raw = JSON.stringify({ object: "page", entry: [{ id: "p", time: 1, changes: [{ field: "leadgen", value: { leadgen_id: leadgenId, form_id: "f", page_id: "p" } }] }] });
    return call("/api/webhooks/meta", { method: "POST", body: raw, headers: { "content-type": "application/json", "x-hub-signature-256": await computeMetaSignature(raw, "segreto-test") } });
  }

  it("con un lead aperto: il lead in arrivo non resta, sull'aperto lo storico e il punteggio", async () => {
    await authed();
    await inserisci("aperto", "da-richiamare", { phone: "333 999 8888", score: "giallo" });
    expect((await webhook("L1", { full_name: "Già noto", phone_number: "+39 3339998888" })).status).toBe(200);
    const vivi = await righe("SELECT id, score FROM leads WHERE deleted_at IS NULL");
    expect(vivi).toEqual([{ id: "aperto", score: "verde" }]);
    expect(await storico("aperto")).toContain("Arrivato di nuovo da Meta");
    // Il lead di passaggio non finisce nel cestino.
    const cestino = (await (await call("/api/leads/trash", {}, await authedCookie())).json()) as { leads: unknown[] };
    expect(cestino.leads).toHaveLength(0);
  });

  it("con un lead in 80: si riapre in 10", async () => {
    await authed();
    await inserisci("perso", "non-chiuso", { email: "a@b-finto.it", lostReason: "non_ora" });
    await webhook("L2", { full_name: "Di nuovo", email: "A@B-finto.it" });
    expect(await righe("SELECT id, stage_id FROM leads WHERE deleted_at IS NULL")).toEqual([{ id: "perso", stage_id: "da-chiamare-prima-volta" }]);
  });
});

async function authedCookie() {
  const r = await call("/api/auth/login", { method: "POST", json: { username: "tommaso", password: "password-lunga-1" } });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}

describe("import CSV", () => {
  const csv = (...righeCsv: string[]) => ["Azienda;Referente;Telefono;Email", ...righeCsv].join("\n");

  it("due righe già presenti: anteprima 0 nuovi, 2 già presenti", async () => {
    const cookie = await authed();
    await inserisci("uno", "da-richiamare", { phone: "333 111 2222" });
    await inserisci("due", "in-attesa-preventivo", { email: "due@finto.it" });
    const r = await call("/api/import/leads?anteprima=1", { method: "POST", json: { csv: csv("Uno;Mario;333 111 2222;", "Due;Anna;;DUE@finto.it"), file: "vecchi.csv" } }, cookie);
    expect(await r.json()).toMatchObject({ nuovi: 0, giaPresenti: 2, senzaContatti: 0, errori: 0 });
  });

  it("import: nuovi in 10, senza contatti in 90 con nota, già presenti con lo storico; ogni riga 'Importato da <file>'", async () => {
    const cookie = await authed();
    await inserisci("uno", "da-richiamare", { phone: "333 111 2222", score: "grigio" });
    const ant = (await (await call("/api/import/leads?anteprima=1", { method: "POST", json: { csv: csv("Uno;Mario;333 111 2222;", "Nuova Srl;Luca;333 777 8888;", "Senza Snc;Pia;;"), file: "vecchi.csv" } }, cookie)).json()) as { righe: unknown[]; nuovi: number; giaPresenti: number; senzaContatti: number };
    expect(ant).toMatchObject({ nuovi: 1, giaPresenti: 1, senzaContatti: 1 });
    const r = await call("/api/import/leads", { method: "POST", json: { righe: ant.righe, file: "vecchi.csv" } }, cookie);
    expect(await r.json()).toMatchObject({ creati: 2, giaPresenti: 1 });
    const nuovi = await righe("SELECT id, company, stage_id, source, notes FROM leads WHERE id <> 'uno' ORDER BY company");
    expect(nuovi.map((l) => [l.company, l.stage_id, l.source])).toEqual([["Nuova Srl", "da-chiamare-prima-volta", "migrazione"], ["Senza Snc", "fake", "migrazione"]]);
    expect(String(nuovi[1].notes)).toContain("Senza telefono né email");
    for (const l of nuovi) expect((await storico(String(l.id))).join("\n")).toContain("Importato da vecchi.csv");
    expect(await storico("uno")).toContain("Arrivato di nuovo da vecchi.csv");
    expect((await righe("SELECT score FROM leads WHERE id = 'uno'"))[0].score).toBe("giallo");
  });
});
