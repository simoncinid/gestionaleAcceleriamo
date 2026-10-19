import { beforeEach, describe, expect, it } from "vitest";
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { app } from "../worker/app";
import { call, createUser } from "./helpers";

const NOW = 1_800_000_000_000;

async function risorsa(slug: string, attiva = 1) {
  await env.DB.prepare("INSERT INTO risorse (slug, titolo, sottotitolo, corpo, pdf_url, attiva, creata_il) VALUES (?,?,?,?,?,?,?)")
    .bind(slug, "lo schema del workflow", "In tre passi", "Primo passo\n\n- uno\n- due", slug === "guida" ? "https://esempio.it/guida.pdf" : null, attiva, NOW).run();
}
const richiesta = (slug: string, json: unknown) => call(`/api/pubblico/risorse/${slug}/richiesta`, { method: "POST", json });
const righe = async (t: string) => (await env.DB.prepare(`SELECT count(*) n FROM ${t}`).first<{ n: number }>())!.n;
const valido = { nome: "Mario Rossi", azienda: "Rossi Srl", telefono: "333 123 4567", messaggio: "Meglio il pomeriggio" };

beforeEach(async () => {
  await createUser();
  await risorsa("guida");
  await risorsa("spenta", 0);
});

describe("pagine risorsa pubbliche: lettura", () => {
  it("risorsa attiva: 200 senza login, con i quattro campi", async () => {
    const res = await call("/api/pubblico/risorse/guida");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ titolo: "lo schema del workflow", sottotitolo: "In tre passi", corpo: "Primo passo\n\n- uno\n- due", pdfUrl: "https://esempio.it/guida.pdf" });
  });
  it("disattivata o inesistente: 404 con messaggio", async () => {
    for (const slug of ["spenta", "non-esiste"]) {
      const res = await call(`/api/pubblico/risorse/${slug}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Risorsa non trovata" });
    }
  });
});

describe("pagine risorsa pubbliche: richiesta di chiamata", () => {
  it("richiesta valida: salvata, avviso per tutti, leads vuota", async () => {
    const res = await richiesta("guida", valido);
    expect(res.status).toBe(204);
    const r = await env.DB.prepare("SELECT slug, nome, azienda, telefono, messaggio FROM risorse_richieste").first<Record<string, string>>();
    expect(r).toEqual({ slug: "guida", ...valido });
    const a = await env.DB.prepare("SELECT titolo, href, push_at, telegram_at FROM notifications WHERE evento = 'risorsa_richiesta'").first<Record<string, unknown>>();
    expect(a).toMatchObject({ titolo: "Richiesta di chiamata da una pagina risorsa", href: "/automazioni/risponditore", push_at: null, telegram_at: null });
    expect(await righe("leads")).toBe(0);
  });
  it("campo trappola pieno: 204 senza salvare né avvisare", async () => {
    const res = await richiesta("guida", { ...valido, sito: "http://spam.it" });
    expect(res.status).toBe(204);
    expect(await righe("risorse_richieste")).toBe(0);
    expect(await righe("notifications")).toBe(0);
  });
  it("campi mancanti o fuori misura: 400 in italiano, nulla salvato", async () => {
    const casi: [Record<string, unknown>, RegExp][] = [
      [{ ...valido, nome: " " }, /nome/i],
      [{ ...valido, azienda: "" }, /azienda/i],
      [{ ...valido, telefono: "" }, /telefono/i],
      [{ ...valido, telefono: "12345" }, /telefono/i],
      [{ ...valido, nome: "a".repeat(121) }, /nome/i],
      [{ ...valido, azienda: "a".repeat(121) }, /azienda/i],
      [{ ...valido, telefono: "3".repeat(31) }, /telefono/i],
      [{ ...valido, messaggio: "a".repeat(1001) }, /messaggio/i],
    ];
    for (const [corpo, atteso] of casi) {
      const res = await richiesta("guida", corpo);
      expect(res.status).toBe(400);
      const { error } = (await res.json()) as { error: string };
      expect(error).toMatch(atteso);
      expect(error).not.toMatch(/[—–]/);
    }
    expect(await righe("risorse_richieste")).toBe(0);
  });
  it("risorsa disattivata o inesistente: 404, nulla salvato", async () => {
    expect((await richiesta("spenta", valido)).status).toBe(404);
    expect((await richiesta("non-esiste", valido)).status).toBe(404);
    expect(await righe("risorse_richieste")).toBe(0);
  });
  it("spazio demo: 204 ma non scrive e non avvisa", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("https://test.local/api/pubblico/risorse/guida/richiesta", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(valido),
    }), { ...env, SPAZIO: "demo" }, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(204);
    expect(await righe("risorse_richieste")).toBe(0);
    expect(await righe("notifications")).toBe(0);
  });
});
