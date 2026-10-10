import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { cellaCsv, colonneImport, leggiCsv } from "../worker/dati/csv";
import { call, createUser, loginCookie } from "./helpers";

let cookie = "";
beforeEach(async () => {
  await createUser("tommaso", "password-lunga-1", "Tommaso Rovini");
  cookie = await loginCookie("tommaso", "password-lunga-1");
  await env.DB.prepare("INSERT INTO leads (id, company, email, email_norm, source, stage_id, stage_changed_at, created_at, updated_at) VALUES ('L1', 'Già Qui', 'mario@gia.it', 'mario@gia.it', 'meta', 'da-richiamare', 0, 0, 0)").run();
});

describe("csv", () => {
  it("legge virgole e punti e virgola, virgolette e a capo nelle celle", () => {
    expect(leggiCsv('a;b\n"x;y";"una ""citazione""\nsu due righe"\n')).toEqual([["a", "b"], ["x;y", 'una "citazione"\nsu due righe']]);
    expect(leggiCsv("a,b\r\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("riconosce le colonne in italiano", () => {
    expect(colonneImport(["Ragione sociale", "Nome e cognome", "Cellulare", "E-mail", "Note"])).toEqual({ company: 0, contactName: 1, phone: 2, email: 3, notes: 4 });
  });
  it("protegge le celle che Excel prenderebbe per formule", () => {
    expect(cellaCsv("=1+1")).toBe("'=1+1");
    expect(cellaCsv("a;b")).toBe('"a;b"');
    expect(cellaCsv(null)).toBe("");
  });
});

describe("import", () => {
  const csv = "Azienda;Referente;Email;Telefono\nNuova Srl;Anna;anna@nuova.it;3331112222\nGià Qui;Mario;MARIO@gia.it;\n;Senza azienda;x@y.it;\nNuova Srl bis;Anna;anna@nuova.it;\n";
  it("anteprima: nuovo, doppione col database, errore, doppione nel file", async () => {
    const a = await (await call("/api/import/leads?anteprima=1", { method: "POST", json: { csv } }, cookie)).json<{ righe: { esito: string; motivo: string | null }[]; nuovi: number; doppioni: number; errori: number }>();
    expect(a.righe.map((r) => r.esito)).toEqual(["nuovo", "doppione", "errore", "doppione"]);
    expect(a).toMatchObject({ nuovi: 1, doppioni: 2, errori: 1 });
    expect(a.righe[2].motivo).toBe("Manca l'azienda");
  });
  it("import: crea i nuovi senza catena e senza email, salta i doppioni", async () => {
    const a = await (await call("/api/import/leads?anteprima=1", { method: "POST", json: { csv } }, cookie)).json<{ righe: { esito: string }[] }>();
    const r = await (await call("/api/import/leads", { method: "POST", json: { righe: a.righe } }, cookie)).json<{ creati: number; saltati: number }>();
    expect(r).toEqual({ creati: 1, saltati: 3 });
    const l = await env.DB.prepare("SELECT source, confirmation_sent_at AS c FROM leads WHERE company = 'Nuova Srl'").first<{ source: string; c: number | null }>();
    expect(l).toEqual({ source: "manuale", c: null });
    const job = await env.DB.prepare("SELECT COUNT(*) AS n FROM ai_jobs").first<{ n: number }>();
    expect(job?.n).toBe(0);
  });
  it("più di 20 righe per chiamata: 400", async () => {
    const righe = Array.from({ length: 21 }, (_, i) => ({ riga: i + 2, company: `A${i}`, contactName: null, email: null, phone: null, website: null, notes: null, esito: "nuovo", motivo: null }));
    expect((await call("/api/import/leads", { method: "POST", json: { righe } }, cookie)).status).toBe(400);
  });
});

describe("export, registro, riepilogo", () => {
  it("export dei lead in CSV con BOM e punto e virgola", async () => {
    await env.DB.prepare("UPDATE leads SET company = '=HYPERLINK(1)' WHERE id = 'L1'").run();
    const r = await call("/api/export/leads", {}, cookie);
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(r.headers.get("content-disposition")).toContain("lead-");
    const t = await r.text();
    expect(t.charCodeAt(0)).toBe(0xfeff);
    expect(t).toContain("'=HYPERLINK(1)");
    expect(t.split("\n")[0]).toContain(";");
  });
  it("tipo sconosciuto: 404", async () => {
    expect((await call("/api/export/utenti", {}, cookie)).status).toBe(404);
  });
  it("registro e riepilogo", async () => {
    await env.DB.prepare("INSERT INTO audit_log (id, user_id, entity, entity_id, action, created_at) VALUES ('U1', 'tommaso', 'lead', 'L1', 'update', 5)").run();
    const g = await (await call("/api/audit", {}, cookie)).json<{ voci: { chi: string }[] }>();
    expect(g.voci[0].chi).toBe("Tommaso Rovini");
    const d = await (await call("/api/dati/riepilogo", {}, cookie)).json<{ cestino: number; ultimaModifica: number; demoUrl: string | null }>();
    expect(d).toMatchObject({ cestino: 0, ultimaModifica: 5 });
  });
  it("401 senza sessione", async () => {
    for (const p of ["/api/export/leads", "/api/audit", "/api/dati/riepilogo"]) expect((await call(p)).status).toBe(401);
    expect((await call("/api/import/leads", { method: "POST", json: {} })).status).toBe(401);
  });
});

// Le query di una richiesta HTTP contano come quelle del giro: 50 sul piano gratuito, compresa la lettura della sessione.
async function conQuery(path: string, init: RequestInit & { json?: unknown }) {
  const { createExecutionContext, waitOnExecutionContext } = await import("cloudflare:test");
  const { app } = await import("../worker/app");
  const { contaD1 } = await import("../worker/lib/bilancio");
  const c = { query: 0 };
  const headers = new Headers({ cookie, "content-type": "application/json" });
  const ctx = createExecutionContext();
  const r = await app.fetch(new Request(`https://test.local${path}`, { ...init, headers, body: JSON.stringify(init.json) }), { ...env, DB: contaD1(env.DB, c) }, ctx);
  await waitOnExecutionContext(ctx);
  return { r, query: c.query };
}

describe("import: limiti e casi in più", () => {
  it("20 righe nuove: sotto le 50 query della richiesta", async () => {
    const righe = Array.from({ length: 20 }, (_, i) => ({ riga: i + 2, company: `Azienda ${i}`, contactName: null, email: `a${i}@x.it`, phone: `33300000${String(i).padStart(2, "0")}`, website: null, notes: null, esito: "nuovo", motivo: null }));
    const { r, query } = await conQuery("/api/import/leads", { method: "POST", json: { righe } });
    expect(await r.json()).toEqual({ creati: 20, saltati: 0 });
    expect(query).toBeLessThanOrEqual(45);
    const att = await env.DB.prepare("SELECT COUNT(*) AS n FROM activities WHERE type = 'migrazione'").first<{ n: number }>();
    expect(att?.n).toBe(20);
  });
  it("anteprima di 500 righe: sotto le 50 query", async () => {
    const csv = ["Azienda;Email;Telefono", ...Array.from({ length: 500 }, (_, i) => `A${i};a${i}@x.it;3331${String(i).padStart(6, "0")}`)].join("\n");
    const { r, query } = await conQuery("/api/import/leads?anteprima=1", { method: "POST", json: { csv } });
    expect(((await r.json()) as { nuovi: number }).nuovi).toBe(500);
    expect(query).toBeLessThanOrEqual(15);
  });
  it("file con BOM, virgole e intestazione senza azienda", async () => {
    const ok = await (await call("/api/import/leads?anteprima=1", { method: "POST", json: { csv: "﻿Ragione sociale,E-mail\nBeta Srl,b@beta.it\n" } }, cookie)).json<{ righe: { company: string; email: string }[] }>();
    expect(ok.righe[0]).toMatchObject({ company: "Beta Srl", email: "b@beta.it" });
    const r = await call("/api/import/leads?anteprima=1", { method: "POST", json: { csv: "Nome;Email\nAnna;a@a.it\n" } }, cookie);
    expect(r.status).toBe(400);
    expect((await r.json<{ error: string }>()).error).toContain("azienda");
  });
  it("l'esito mandato dalla pagina non fa testo: un doppione travestito da nuovo resta fuori", async () => {
    const righe = [{ riga: 2, company: "Finto Nuovo", contactName: null, email: "mario@gia.it", phone: null, website: null, notes: null, esito: "nuovo", motivo: null }];
    expect(await (await call("/api/import/leads", { method: "POST", json: { righe } }, cookie)).json()).toEqual({ creati: 0, saltati: 1 });
  });
  it("l'import finisce nel registro", async () => {
    const righe = [{ riga: 2, company: "Gamma", contactName: null, email: null, phone: null, website: null, notes: null, esito: "nuovo", motivo: null }];
    await call("/api/import/leads", { method: "POST", json: { righe } }, cookie);
    const g = await (await call("/api/audit", {}, cookie)).json<{ voci: { entita: string; azione: string }[] }>();
    expect(g.voci[0]).toMatchObject({ entita: "import", azione: "importa 1 lead" });
  });
});

describe("export e registro: casi in più", () => {
  it("proposte e fatture: date in AAAA-MM-GG, intestazione italiana", async () => {
    await env.DB.prepare("INSERT INTO proposals (id, lead_id, number, company, status, registered_via, sent_at, created_at, updated_at) VALUES ('P1', 'L1', 'ACC-1', 'Già Qui', 'mandata', 'manuale', ?1, 0, 0)").bind(Date.UTC(2026, 9, 3)).run();
    const t = await (await call("/api/export/proposte", {}, cookie)).text();
    expect(t.split("\n")[0]).toBe("﻿numero;azienda;opzione;setup (centesimi);canone (centesimi);stato;mandata il;presentata il;decisa il");
    expect(t).toContain("ACC-1;Già Qui;standard;;;mandata;2026-10-03;;");
    await env.DB.prepare("INSERT INTO clients (id, name, created_at) VALUES ('C1', 'Cliente Uno', 0)").run();
    await env.DB.prepare("INSERT INTO invoices (id, client_id, kind, number, amount_cents) VALUES ('I1', 'C1', 'canone', '12/2026', 15000)").run();
    const f = await (await call("/api/export/fatture", {}, cookie)).text();
    expect(f).toContain("12/2026;Cliente Uno;canone;15000;");
    const reg = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'export'").first<{ n: number }>();
    expect(reg?.n).toBe(2);
  });
  it("tipo che esiste solo sul prototipo: 404", async () => {
    expect((await call("/api/export/constructor", {}, cookie)).status).toBe(404);
  });
  it("registro a pagine da 50: prossimo e voci prima", async () => {
    const valori = Array.from({ length: 55 }, (_, i) => `('A${i}', 'tommaso', 'lead', 'L1', 'update', ${1000 + i})`).join(", ");
    await env.DB.prepare(`INSERT INTO audit_log (id, user_id, entity, entity_id, action, created_at) VALUES ${valori}`).run();
    const p1 = await (await call("/api/audit", {}, cookie)).json<{ voci: { at: number }[]; prossimo: number | null }>();
    expect(p1.voci).toHaveLength(50);
    expect(p1.prossimo).toBe("1005:A5");
    const p2 = await (await call(`/api/audit?prima=${p1.prossimo}`, {}, cookie)).json<{ voci: { at: number }[]; prossimo: number | null }>();
    expect(p2.voci.map((v) => v.at)).toEqual([1004, 1003, 1002, 1001, 1000]);
    expect(p2.prossimo).toBeNull();
  });
  it("registro: voci nello stesso millisecondo a cavallo di pagina non si perdono", async () => {
    const valori = Array.from({ length: 55 }, (_, i) => `('B${String(i).padStart(2, "0")}', 'tommaso', 'lead', 'L1', 'update', 7000)`).join(", ");
    await env.DB.prepare(`INSERT INTO audit_log (id, user_id, entity, entity_id, action, created_at) VALUES ${valori}`).run();
    const p1 = await (await call("/api/audit", {}, cookie)).json<{ voci: { id: string }[]; prossimo: string | null }>();
    const p2 = await (await call(`/api/audit?prima=${encodeURIComponent(p1.prossimo!)}`, {}, cookie)).json<{ voci: { id: string }[] }>();
    const ids = [...p1.voci, ...p2.voci].map((v) => v.id).filter((id) => id.startsWith("B"));
    expect(new Set(ids).size).toBe(55);
  });
});

describe("import: stessi limiti in anteprima e import (revisione Task 12)", () => {
  const riga = (n: number, extra: Record<string, unknown> = {}) => ({ riga: n, company: `Pulita ${n}`, contactName: null, email: null, phone: null, website: null, notes: null, esito: "nuovo", motivo: null, ...extra });
  it("anteprima: telefono di 51 caratteri e note di 2001 sono errori col motivo, non nuovi", async () => {
    const csv = `Azienda;Telefono;Note\nAlfa;${"3".repeat(51)};\nBeta;;${"n".repeat(2001)}\nGamma;3331234567;breve\n`;
    const a = await (await call("/api/import/leads?anteprima=1", { method: "POST", json: { csv } }, cookie)).json<{ righe: { riga: number; esito: string; motivo: string | null }[]; nuovi: number; errori: number }>();
    expect(a.righe.map((r) => r.esito)).toEqual(["errore", "errore", "nuovo"]);
    expect(a.righe[0].motivo).toBe("Telefono troppo lungo: al massimo 50 caratteri");
    expect(a.righe[1].motivo).toBe("Note troppo lunghe: al massimo 2000 caratteri");
    expect(a).toMatchObject({ nuovi: 1, errori: 2 });
  });
  it("import: la riga troppo lunga dà 400 con riga e motivo, un blocco pulito passa", async () => {
    const r = await call("/api/import/leads", { method: "POST", json: { righe: [riga(2), riga(3, { phone: "3".repeat(51) })] } }, cookie);
    expect(r.status).toBe(400);
    expect((await r.json<{ error: string }>()).error).toBe("Riga 3: Telefono troppo lungo: al massimo 50 caratteri");
    const note = await call("/api/import/leads", { method: "POST", json: { righe: [riga(4, { notes: "n".repeat(2001) })] } }, cookie);
    expect((await note.json<{ error: string }>()).error).toBe("Riga 4: Note troppo lunghe: al massimo 2000 caratteri");
    expect(await (await call("/api/import/leads", { method: "POST", json: { righe: [riga(2), riga(5)] } }, cookie)).json()).toEqual({ creati: 2, saltati: 0 });
  });
  it("più di 20 righe: messaggio diverso da quello della riga non valida", async () => {
    const r = await call("/api/import/leads", { method: "POST", json: { righe: Array.from({ length: 21 }, (_, i) => riga(i + 2)) } }, cookie);
    expect(r.status).toBe(400);
    expect((await r.json<{ error: string }>()).error).toBe("Al massimo 20 righe per volta");
  });
  it("riga con la sola azienda importata due volte: la seconda è un doppione", async () => {
    const csv = "Azienda\nSolo  Nome Srl\n";
    const prima = await (await call("/api/import/leads?anteprima=1", { method: "POST", json: { csv } }, cookie)).json<{ righe: { esito: string }[] }>();
    expect(prima.righe[0].esito).toBe("nuovo");
    expect(await (await call("/api/import/leads", { method: "POST", json: { righe: prima.righe } }, cookie)).json()).toEqual({ creati: 1, saltati: 0 });
    const seconda = await (await call("/api/import/leads?anteprima=1", { method: "POST", json: { csv: "Azienda\nsolo nome SRL\n" } }, cookie)).json<{ righe: { esito: string; motivo: string | null }[] }>();
    expect(seconda.righe[0]).toEqual(expect.objectContaining({ esito: "doppione", motivo: "C'è già un lead con la stessa azienda" }));
    expect(await (await call("/api/import/leads", { method: "POST", json: { righe: [riga(2, { company: "SOLO NOME srl" })] } }, cookie)).json()).toEqual({ creati: 0, saltati: 1 });
  });
  it("sola azienda ripetuta nel file: la seconda è un doppione", async () => {
    const a = await (await call("/api/import/leads?anteprima=1", { method: "POST", json: { csv: "Azienda\nDelta\ndelta\n" } }, cookie)).json<{ righe: { esito: string }[] }>();
    expect(a.righe.map((r) => r.esito)).toEqual(["nuovo", "doppione"]);
  });
});
