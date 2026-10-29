import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { giro } from "../worker/cron";
import { getDb } from "../worker/db/client";
import { daRoma } from "../worker/lib/roma";
import { pulisciDocumenti } from "../worker/leads/pulizia-documenti";
import { authed, call } from "./helpers";

// Documenti tolti (decisione di Tommaso del 29/10/2026): dopo 30 giorni via i file su R2 e le righe; via anche le cartelle orfane.
const GIORNO = 86_400_000;
const ORA = daRoma(2026, 11, 2, 6, 40);

async function nuovoLead(cookie: string, company: string) {
  const res = await call("/api/leads", { method: "POST", json: { company, phone: `+39 333 ${Math.floor(1_000_000 + Math.random() * 8_999_999)}` } }, cookie);
  return ((await res.json()) as { lead: { id: string } }).lead.id;
}
async function carica(path: string, cookie: string, testo = "x") {
  const b = new TextEncoder().encode(testo);
  return call(path, { method: "POST", body: b, headers: { "content-type": "application/octet-stream", "content-length": String(b.byteLength) } }, cookie);
}
const oggetti = async (prefisso: string) => (await env.DOCUMENTI!.list({ prefix: prefisso })).objects.length;
const righe = async (tabella: string, doc: string) =>
  (await env.DB.prepare(`SELECT count(*) n FROM ${tabella} WHERE ${tabella === "documents" ? "id" : "document_id"} = ?`).bind(doc).first<{ n: number }>())?.n;

async function documentoTolto(cookie: string, leadId: string, nome: string, giorniFa: number) {
  const { document } = (await (await carica(`/api/leads/${leadId}/documents?nome=${nome}`, cookie)).json()) as { document: { id: string } };
  await carica(`/api/documents/${document.id}/versioni?nome=${nome}`, cookie, "v2");
  if (giorniFa >= 0) await env.DB.prepare("UPDATE documents SET deleted_at = ? WHERE id = ?").bind(ORA - giorniFa * GIORNO, document.id).run();
  return document.id;
}

describe("pulizia dei documenti tolti", () => {
  it("oltre 30 giorni via file e righe; i recenti e quelli vivi restano", async () => {
    const cookie = await authed();
    const lead = await nuovoLead(cookie, "Pulizia Srl");
    const vecchio = await documentoTolto(cookie, lead, "vecchio.pdf", 31);
    const recente = await documentoTolto(cookie, lead, "recente.pdf", 10);
    const vivo = await documentoTolto(cookie, lead, "vivo.pdf", -1);
    expect(await oggetti(`lead/${lead}/${vecchio}/`)).toBe(2);

    const r = await pulisciDocumenti(getDb(env.DB), env.DB, env.DOCUMENTI, ORA, 20);
    expect(r.documenti).toBe(1);
    expect(await oggetti(`lead/${lead}/${vecchio}/`)).toBe(0);
    expect(await righe("documents", vecchio)).toBe(0);
    expect(await righe("document_versions", vecchio)).toBe(0);
    for (const d of [recente, vivo]) {
      expect(await oggetti(`lead/${lead}/${d}/`)).toBe(2);
      expect(await righe("document_versions", d)).toBe(2);
    }
  });

  it("toglie le cartelle R2 orfane, non quelle dei lead nel cestino", async () => {
    const cookie = await authed();
    const nelCestino = await nuovoLead(cookie, "Cestinato Srl");
    await documentoTolto(cookie, nelCestino, "a.pdf", -1);
    await call(`/api/leads/${nelCestino}`, { method: "DELETE" }, cookie);
    await env.DOCUMENTI!.put("lead/fantasma-pulizia/doc/v1", "resto");
    await env.DOCUMENTI!.put("lead/fantasma-pulizia/doc/v2", "resto");
    const r = await pulisciDocumenti(getDb(env.DB), env.DB, env.DOCUMENTI, ORA, 20);
    expect(r.cartelle).toBeGreaterThanOrEqual(1);
    expect(await oggetti("lead/fantasma-pulizia/")).toBe(0);
    expect(await oggetti(`lead/${nelCestino}/`)).toBe(2);
  });

  it("rispetta il limite del giro e senza bucket risulta spento", async () => {
    const cookie = await authed();
    const lead = await nuovoLead(cookie, "Limite Srl");
    for (const n of ["a.pdf", "b.pdf", "c.pdf"]) await documentoTolto(cookie, lead, n, 40);
    expect((await pulisciDocumenti(getDb(env.DB), env.DB, env.DOCUMENTI, ORA, 2)).documenti).toBe(2);
    expect((await pulisciDocumenti(getDb(env.DB), env.DB, env.DOCUMENTI, ORA, 2)).documenti).toBe(1);
    expect(await pulisciDocumenti(getDb(env.DB), env.DB, undefined, ORA, 2)).toMatchObject({ spento: true });
  });

  it("gira nel giro delle 6:40 e lascia l'esito nella pagina Stato", async () => {
    const cookie = await authed();
    const lead = await nuovoLead(cookie, "Giro Srl");
    const doc = await documentoTolto(cookie, lead, "giro.pdf", 31);
    const r = await giro(env, ORA);
    expect(r.fatti).toContain("documenti");
    expect(await righe("documents", doc)).toBe(0);
    const esito = await env.DB.prepare("SELECT esito FROM stato_giri WHERE voce_id = 'giro:documenti'").first<{ esito: string }>();
    expect(esito?.esito).toBe("ok");
  });
});
