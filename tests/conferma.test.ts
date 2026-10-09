import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setEmailFetch } from "../worker/email/fetcher";
import { MAX_TENTATIVI_CONFERMA, confermaNonPartita, mandaConferma, ritentaConferme } from "../worker/email/conferma";
import { setMetaFetch } from "../worker/meta/fetcher";
import { computeMetaSignature } from "../worker/meta/signature";
import { call } from "./helpers";

const NOW = Date.UTC(2026, 9, 13, 20, 0);
type Inviata = { url: string; headers: Record<string, string>; corpo: { from: string; to: string[]; reply_to: string; subject: string; text: string; html: string } };
let inviate: Inviata[] = [];
const resend = (status = 200) =>
  setEmailFetch(async (url, init) => {
    inviate.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()), corpo: JSON.parse(String(init?.body)) });
    return status === 200 ? Response.json({ id: `re_${inviate.length}` }) : Response.json({ message: "errore finto" }, { status });
  });
async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: "Officina Prova", contact_name: "Luca Prova", email: "luca@officina-prova.it", source: "meta", stage_id: "da-chiamare-prima-volta", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}
const lead = (id: string) => env.DB.prepare("SELECT confirmation_sent_at, confirmation_attempts, confirmation_error FROM leads WHERE id = ?").bind(id).first<{ confirmation_sent_at: number | null; confirmation_attempts: number; confirmation_error: string | null }>();

afterEach(() => { inviate = []; setEmailFetch(null); setMetaFetch(null); });

describe("email di conferma", () => {
  it("un lead da Meta con email: una email col modello, il piede e la chiave del lead; storico", async () => {
    resend();
    await insertLead("a");
    expect(await mandaConferma(env, "a", NOW)).toBe("mandata");
    expect(inviate).toHaveLength(1);
    const [m] = inviate;
    expect(m.headers["idempotency-key"]).toBe("conferma-a");
    expect(m.corpo.to).toEqual(["luca@officina-prova.it"]);
    expect(m.corpo.subject).toBe("Abbiamo ricevuto la tua richiesta");
    expect(m.corpo.text).toMatch(/^Ciao Luca, grazie per averci scritto\./);
    expect(m.corpo.text).toContain("Informativa privacy");
    expect(m.corpo.html).toContain("<p>Ciao Luca, grazie per averci scritto.");
    expect((await lead("a"))?.confirmation_sent_at).toBe(NOW);
    const storico = await env.DB.prepare("SELECT body FROM activities WHERE lead_id = 'a' AND type = 'email_auto'").first<{ body: string }>();
    expect(storico?.body).toBe("Email di conferma mandata alle 22:00");
  });

  it("una volta sola: la seconda chiamata non manda niente", async () => {
    resend();
    await insertLead("b");
    await mandaConferma(env, "b", NOW);
    expect(await mandaConferma(env, "b", NOW + 1000)).toBe("saltata");
    expect(inviate).toHaveLength(1);
  });

  it("nessun invio senza email valida, per i lead a mano, a interruttore spento, per il doppione di un lead già confermato", async () => {
    resend();
    await insertLead("senza", { email: null });
    await insertLead("rotta", { email: "luca at officina" });
    await insertLead("mano", { source: "manuale" });
    await insertLead("primo", { confirmation_sent_at: NOW - 1000 });
    await insertLead("doppione", { duplicate_of_id: "primo" });
    for (const id of ["senza", "rotta", "mano", "doppione"]) expect(await mandaConferma(env, id, NOW)).toBe("saltata");
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('conferma', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(JSON.stringify({ attiva: false, mittente: "Tommaso <t@mail.acceleriamo.it>", rispondiA: "t@acceleriamo.it", piede: "x" }), NOW).run();
    await insertLead("spento");
    expect(await mandaConferma(env, "spento", NOW)).toBe("saltata");
    expect(inviate).toHaveLength(0);
  });

  it("errore di Resend: conta il tentativo, il giro ritenta, dopo tre ritentativi si ferma e lo stato diventa rosso", async () => {
    resend(500);
    await insertLead("c");
    expect(await mandaConferma(env, "c", NOW)).toBe("errore");
    expect(await lead("c")).toMatchObject({ confirmation_sent_at: null, confirmation_attempts: 1, confirmation_error: "Resend non raggiungibile, si riprova" });
    for (let i = 0; i < 5; i++) await ritentaConferme(env, NOW + (i + 1) * 300_000);
    expect(inviate).toHaveLength(MAX_TENTATIVI_CONFERMA);
    expect((await lead("c"))?.confirmation_attempts).toBe(MAX_TENTATIVI_CONFERMA);
    expect(await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'resend'").first()).toEqual({ ok: 0 });
  });

  it("il giro ritenta e alla fine manda", async () => {
    resend(500);
    await insertLead("d");
    await mandaConferma(env, "d", NOW);
    resend();
    expect(await ritentaConferme(env, NOW + 300_000)).toBe(1);
    expect((await lead("d"))?.confirmation_sent_at).toBe(NOW + 300_000);
    expect(await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'resend'").first()).toEqual({ ok: 1 });
  });

  it("dal webhook Meta: la catena manda la conferma una volta, anche se Meta ripete la notifica", async () => {
    resend();
    setMetaFetch(async () => Response.json({ field_data: [{ name: "full_name", values: ["Anna Prova"] }, { name: "email", values: ["anna@prova.it"] }, { name: "company_name", values: ["Bar Prova"] }] }));
    const raw = JSON.stringify({ object: "page", entry: [{ id: "p", time: 1, changes: [{ field: "leadgen", value: { leadgen_id: "lg-1", form_id: "f" } }] }] });
    const manda = async () => call("/api/webhooks/meta", { method: "POST", body: raw, headers: { "content-type": "application/json", "x-hub-signature-256": await computeMetaSignature(raw, "segreto-test") } });
    await manda();
    await manda();
    expect(inviate).toHaveLength(1);
    expect(inviate[0].corpo.text).toMatch(/^Ciao Anna,/);
  });
  it("senza chiave Resend: nessun errore, nessun tentativo contato, resta in coda e parte quando la chiave c'è", async () => {
    resend();
    await insertLead("k");
    const senzaChiave = { ...env, RESEND_API_KEY: "" };
    expect(await mandaConferma(senzaChiave, "k", NOW)).toBe("saltata");
    expect(await ritentaConferme(senzaChiave, NOW + 300_000)).toBe(0);
    const l = await lead("k");
    expect(l).toMatchObject({ confirmation_sent_at: null, confirmation_attempts: 0 });
    expect(confermaNonPartita({ confirmationSentAt: l!.confirmation_sent_at, confirmationAttempts: l!.confirmation_attempts })).toBe(false);
    expect(await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'resend'").first()).toBeNull();
    expect(inviate).toHaveLength(0);
    expect(await ritentaConferme(env, NOW + 600_000)).toBe(1);
    expect((await lead("k"))?.confirmation_sent_at).toBe(NOW + 600_000);
  });

  it("nei test nessuna chiamata di rete vera: senza fetcher finto l'invio fallisce in locale", async () => {
    await insertLead("rete");
    expect(await mandaConferma(env, "rete", NOW)).toBe("errore");
    // Una chiamata vera con la chiave finta tornerebbe 401 ("Chiave Resend non valida"): qui l'errore nasce in locale.
    expect(await lead("rete")).toMatchObject({ confirmation_attempts: 1, confirmation_error: "Resend non raggiungibile, si riprova" });
  });
  it("motivo in italiano: un 422 diventa \"Indirizzo email rifiutato da Resend\", il testo tecnico resta nello stato", async () => {
    resend(422);
    await insertLead("r422");
    expect(await mandaConferma(env, "r422", NOW)).toBe("errore");
    expect(await lead("r422")).toMatchObject({ confirmation_attempts: MAX_TENTATIVI_CONFERMA, confirmation_error: "Indirizzo email rifiutato da Resend" });
    const stato = await env.DB.prepare("SELECT last_error FROM integration_status WHERE key = 'resend'").first<{ last_error: string }>();
    expect(stato?.last_error).toContain("Resend 422: errore finto");
  });

  it("doppione in coda non blocca il giro: esce dalla coda e il giro dopo non lo ritrova", async () => {
    resend();
    const senzaChiave = { ...env, RESEND_API_KEY: "" };
    await insertLead("l1", { created_at: NOW - 2000 });
    await insertLead("l2", { created_at: NOW - 1000 });
    await mandaConferma(senzaChiave, "l1", NOW);
    await mandaConferma(senzaChiave, "l2", NOW);
    await env.DB.prepare("UPDATE leads SET duplicate_of_id = 'l1' WHERE id = 'l2'").run();
    expect(await ritentaConferme(env, NOW + 300_000)).toBe(1);
    expect(await lead("l2")).toMatchObject({ confirmation_sent_at: null, confirmation_error: null });
    const coda = await env.DB.prepare("SELECT count(*) AS n FROM leads WHERE confirmation_sent_at IS NULL AND confirmation_error IS NOT NULL").first<{ n: number }>();
    expect(coda?.n).toBe(0);
    expect(await ritentaConferme(env, NOW + 600_000)).toBe(0);
    expect(inviate).toHaveLength(1);
  });

  it("richiesta arrivata più di 48 ore prima della chiave: nessuna email, motivo scritto, non si ritenta", async () => {
    resend();
    const vecchio = NOW - 3 * 86_400_000;
    await insertLead("vecchio", { created_at: vecchio });
    await mandaConferma({ ...env, RESEND_API_KEY: "" }, "vecchio", vecchio + 1000);
    expect(await ritentaConferme(env, NOW)).toBe(0);
    expect(await lead("vecchio")).toMatchObject({
      confirmation_sent_at: null, confirmation_attempts: MAX_TENTATIVI_CONFERMA,
      confirmation_error: "Non mandata: richiesta arrivata più di 48 ore prima del collegamento di Resend",
    });
    expect(await ritentaConferme(env, NOW + 300_000)).toBe(0);
    expect(inviate).toHaveLength(0);
    expect(await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'resend'").first()).toBeNull();
  });

  it("il giro rispetta il limite: 7 in coda, ne manda 5", async () => {
    resend();
    const senzaChiave = { ...env, RESEND_API_KEY: "" };
    for (let i = 0; i < 7; i++) {
      await insertLead(`q${i}`, { created_at: NOW + i });
      await mandaConferma(senzaChiave, `q${i}`, NOW);
    }
    expect(await ritentaConferme(env, NOW + 300_000, 5)).toBe(5);
    expect(inviate).toHaveLength(5);
  });
});
