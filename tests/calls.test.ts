import { afterEach, describe, expect, it } from "vitest";
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { app } from "../worker/app";
import { setEmailFetch } from "../worker/email/fetcher";
import { mandaInvitiInCoda } from "../worker/calls/service";
import { PIEDE_LEGALE, conPiede, indirizzoDi, inviaEmail } from "../worker/email/resend";
import type { Env } from "../worker/env";
import { authed, call } from "./helpers";

const NOW = Date.now();
const DOMANI = NOW + 86_400_000;
async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: "Officina Prova", contact_name: "Luca Prova", email: "luca@esempio.it", phone: "+393330000001", source: "manuale", stage_id: "da-richiamare", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}
const lead = (id: string) => env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first<Record<string, unknown>>();
afterEach(() => setEmailFetch(null));

describe("API delle call", () => {
  it("401 senza sessione", async () => {
    for (const p of ["/api/calls", "/api/leads/x/calls"]) expect((await call(p)).status).toBe(401);
  });

  it("fissa una call di conoscenza: fase e prossima azione dalla tabella 6.3, invito con .ics", async () => {
    const cookie = await authed();
    await insertLead("l1");
    const inviate: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
    setEmailFetch(async (url, init) => {
      inviate.push({ url, body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
      return Response.json({ id: "email-1" });
    });
    const r = await call("/api/leads/l1/calls", { method: "POST", json: { kind: "conoscenza", scheduledAt: DOMANI, meetLink: "https://meet.google.com/abc-defg-hij", invito: true } }, cookie);
    expect(r.status).toBe(201);
    const corpo = (await r.json()) as { call: { id: string }; invito: string };
    expect(corpo.invito).toBe("mandato");
    expect(await lead("l1")).toMatchObject({ stage_id: "appuntamento-confermato", next_action: "Call di conoscenza", next_action_at: DOMANI });
    expect(inviate).toHaveLength(1);
    expect(inviate[0].url).toBe("https://api.resend.com/emails");
    expect(inviate[0].headers.get("authorization")).toBe("Bearer re_test");
    expect(inviate[0].headers.get("idempotency-key")).toBe(`invito-${corpo.call.id}-${DOMANI}`);
    expect(inviate[0].body).toMatchObject({ to: ["luca@esempio.it"], reply_to: "tommaso@acceleriamo.it" });
    expect((inviate[0].body.attachments as { filename: string }[])[0].filename).toBe("invito.ics");
    // Ogni email in uscita porta la riga legale, una volta sola (qui arriva dal piede delle Impostazioni).
    expect(String(inviate[0].body.text).split(PIEDE_LEGALE).length - 1).toBe(1);
    expect(PIEDE_LEGALE).toBe("Acceleriamo è un progetto di Diego Simoncini, P.IVA 02524780505");
    const k = await env.DB.prepare("SELECT invite_sent_at FROM calls WHERE id = ?").bind(corpo.call.id).first<{ invite_sent_at: number | null }>();
    expect(k?.invite_sent_at).not.toBeNull();
    expect(await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'resend'").first()).toEqual({ ok: 1 });
  });

  it("senza email: la call nasce, l'invito no, e lo dice", async () => {
    const cookie = await authed();
    await insertLead("l2", { email: null });
    const r = await call("/api/leads/l2/calls", { method: "POST", json: { kind: "conoscenza", scheduledAt: DOMANI, meetLink: null, invito: true } }, cookie);
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ invito: "non_mandato", errore: "Manca l'email del referente" });
  });

  it("Resend giù: invito non mandato, stato integrazione rosso, la call resta", async () => {
    const cookie = await authed();
    await insertLead("l3");
    setEmailFetch(async () => new Response(JSON.stringify({ message: "boom" }), { status: 500 }));
    const r = await call("/api/leads/l3/calls", { method: "POST", json: { kind: "conoscenza", scheduledAt: DOMANI, meetLink: null, invito: true } }, cookie);
    expect(await r.json()).toMatchObject({ invito: "non_mandato" });
    expect(await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'resend'").first()).toEqual({ ok: 0 });
    expect((await env.DB.prepare("SELECT count(*) n FROM calls WHERE lead_id = 'l3'").first<{ n: number }>())!.n).toBe(1);
  });

  it("chiave Resend mancante: la call nasce, l'invito va in coda, niente rete; il giro lo manda appena c'è la chiave", async () => {
    const cookie = await authed();
    await insertLead("l3b");
    let chiamate = 0;
    setEmailFetch(async () => { chiamate++; return Response.json({ id: "email-coda" }); });
    const senzaChiave = { ...env, RESEND_API_KEY: "" };
    const ctx = createExecutionContext();
    const req = new Request("https://test.local/api/leads/l3b/calls", {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "conoscenza", scheduledAt: DOMANI, meetLink: null, invito: true }),
    });
    const r = await app.fetch(req, senzaChiave, ctx);
    await waitOnExecutionContext(ctx);
    expect(r.status).toBe(201);
    const corpo = (await r.json()) as { call: { id: string }; invito: string; errore: string };
    expect(corpo).toMatchObject({ invito: "in_coda", errore: "Invito in coda: partirà quando Resend sarà collegato" });
    expect(chiamate).toBe(0);
    const riga = () => env.DB.prepare("SELECT invite_queued_at q, invite_sent_at s FROM calls WHERE id = ?").bind(corpo.call.id).first<{ q: number | null; s: number | null }>();
    expect((await riga())?.q).not.toBeNull();

    // Ancora senza chiave il giro non fa niente; con la chiave manda l'invito e svuota la coda.
    expect(await mandaInvitiInCoda(senzaChiave as Env, NOW, 2)).toBe(0);
    expect(await mandaInvitiInCoda(env as Env, NOW, 2)).toBe(1);
    expect(chiamate).toBe(1);
    expect(await riga()).toMatchObject({ q: null });
    expect((await riga())?.s).not.toBeNull();
    expect(await mandaInvitiInCoda(env as Env, NOW, 2)).toBe(0);
  });

  it("inviti in coda senza email: escono dalla coda e non bloccano i posti del giro", async () => {
    for (const [i, email] of [["n1", null], ["n2", null], ["n3", "luca@prova.invalid"]] as const) {
      await insertLead(i, { email });
      await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, invite_queued_at, created_at, updated_at) VALUES (?1, ?2, 'conoscenza', ?3, ?4, ?4, ?4)")
        .bind(`k${i}`, i, DOMANI + (i === "n3" ? 3_600_000 : 0), NOW).run();
    }
    let chiamate = 0;
    setEmailFetch(async () => { chiamate++; return Response.json({ id: "email-x" }); });
    expect(await mandaInvitiInCoda(env as Env, NOW, 2)).toBe(0);
    expect(await mandaInvitiInCoda(env as Env, NOW, 2)).toBe(1);
    expect(chiamate).toBe(1);
    const coda = await env.DB.prepare("SELECT count(*) n FROM calls WHERE invite_queued_at IS NOT NULL").first<{ n: number }>();
    expect(coda?.n).toBe(0);
    const voce = await env.DB.prepare("SELECT body FROM activities WHERE lead_id = 'n1'").first<{ body: string }>();
    expect(voce?.body).toBe("Invito non mandato: il lead non ha un'email");
  });

  it("invito dal foglio dell'esito senza chiave: 202 in coda, non un errore", async () => {
    const cookie = await authed();
    await insertLead("l3c");
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k3c', 'l3c', 'conoscenza', ?, ?, ?)").bind(DOMANI, NOW, NOW).run();
    const ctx = createExecutionContext();
    const req = new Request("https://test.local/api/calls/k3c/invito", { method: "POST", headers: { cookie } });
    const r = await app.fetch(req, { ...env, RESEND_API_KEY: "" }, ctx);
    await waitOnExecutionContext(ctx);
    expect(r.status).toBe(202);
    expect(await r.json()).toMatchObject({ inCoda: true });
  });

  it("conoscenza fatta con la presentazione fissata nello stesso foglio", async () => {
    const cookie = await authed();
    await insertLead("l4", { stage_id: "appuntamento-confermato" });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k4', 'l4', 'conoscenza', ?, ?, ?)").bind(NOW - 3_600_000, NOW, NOW).run();
    const note = JSON.stringify({ problema: "Perde le mail dei clienti" });
    const r = await call("/api/calls/k4", { method: "PATCH", json: { outcome: "fatta", notes: note, presentazione: { scheduledAt: DOMANI, meetLink: null } } }, cookie);
    expect(r.status).toBe(200);
    expect(await lead("l4")).toMatchObject({ stage_id: "presentazione-confermata", next_action: "Call di presentazione", next_action_at: DOMANI });
    const { results } = await env.DB.prepare("SELECT kind, outcome FROM calls WHERE lead_id = 'l4' ORDER BY scheduled_at").all();
    expect(results).toEqual([{ kind: "conoscenza", outcome: "fatta" }, { kind: "presentazione", outcome: null }]);
  });

  it("presentazione fatta: proposta presentata e fase In attesa decisione", async () => {
    const cookie = await authed();
    // Con le sequenze accese il motore avanza al passo 1 (spente, il passo non si muove).
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('sequenze', '{\"attive\":true}', ?)").bind(NOW).run();
    await insertLead("l5", { stage_id: "presentazione-confermata" });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k5', 'l5', 'presentazione', ?, ?, ?)").bind(NOW - 3_600_000, NOW, NOW).run();
    await env.DB.prepare("INSERT INTO proposals (id, lead_id, number, status, registered_via, created_at, updated_at) VALUES ('p5', 'l5', 'ACC-2026-005', 'registrata', 'aggancio', ?, ?)").bind(NOW, NOW).run();
    await call("/api/calls/k5", { method: "PATCH", json: { outcome: "fatta" } }, cookie);
    expect(await lead("l5")).toMatchObject({ stage_id: "in-attesa-decisione", next_action: "Follow-up preventivo", sequence_step: 1 });
    expect(await env.DB.prepare("SELECT status, presented_at IS NOT NULL p FROM proposals WHERE id = 'p5'").first()).toEqual({ status: "presentata", p: 1 });
    const fase = await env.DB.prepare("SELECT body FROM activities WHERE lead_id = 'l5' AND type = 'cambio_fase'").first<{ body: string }>();
    expect(fase?.body).toBe('Da "Presentazione fissata" a "In attesa decisione"');
  });

  it("call saltata: si torna a richiamare", async () => {
    const cookie = await authed();
    await insertLead("l6", { stage_id: "appuntamento-confermato" });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k6', 'l6', 'conoscenza', ?, ?, ?)").bind(NOW - 3_600_000, NOW, NOW).run();
    await call("/api/calls/k6", { method: "PATCH", json: { outcome: "saltata" } }, cookie);
    expect(await lead("l6")).toMatchObject({ stage_id: "da-richiamare", next_action: "Richiamare" });
  });

  it("call rimandata con nuova data: resta in programma e la prossima azione segue la data", async () => {
    const cookie = await authed();
    await insertLead("l6b", { stage_id: "appuntamento-confermato" });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k6b', 'l6b', 'conoscenza', ?, ?, ?)").bind(NOW - 3_600_000, NOW, NOW).run();
    const r = await call("/api/calls/k6b", { method: "PATCH", json: { outcome: "rimandata", scheduledAt: DOMANI } }, cookie);
    expect(((await r.json()) as { call: { outcome: string | null; scheduledAt: number } }).call).toMatchObject({ outcome: null, scheduledAt: DOMANI });
    expect(await lead("l6b")).toMatchObject({ stage_id: "appuntamento-confermato", next_action: "Call di conoscenza", next_action_at: DOMANI });
  });

  it("agenda per intervallo e .ics da scaricare", async () => {
    const cookie = await authed();
    await insertLead("l7");
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('dentro', 'l7', 'conoscenza', ?, ?, ?), ('fuori', 'l7', 'conoscenza', ?, ?, ?)").bind(NOW + 1000, NOW, NOW, NOW + 30 * 86_400_000, NOW, NOW).run();
    const a = (await (await call(`/api/calls?da=${NOW}&a=${NOW + 7 * 86_400_000}`, {}, cookie)).json()) as { calls: { id: string; company: string }[] };
    expect(a.calls.map((k) => k.id)).toEqual(["dentro"]);
    expect(a.calls[0].company).toBe("Officina Prova");
    const ics = await call("/api/calls/dentro/ics", {}, cookie);
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    expect(await ics.text()).toContain("BEGIN:VEVENT");
    const delLead = (await (await call("/api/leads/l7/calls", {}, cookie)).json()) as { calls: { id: string }[] };
    expect(delLead.calls.map((k) => k.id)).toEqual(["dentro", "fuori"]);
  });

  it("due inviti della stessa call: stesso .ics e stessa chiave; il 409 di idempotenza vale come già mandato", async () => {
    const cookie = await authed();
    await insertLead("l8");
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k8', 'l8', 'conoscenza', ?, ?, ?)").bind(DOMANI, NOW, NOW).run();
    const inviate: { body: Record<string, unknown>; chiave: string | null }[] = [];
    setEmailFetch(async (_url, init) => {
      inviate.push({ body: JSON.parse(String(init?.body)), chiave: new Headers(init?.headers).get("idempotency-key") });
      return inviate.length === 1
        ? Response.json({ id: "email-8" })
        : Response.json({ name: "invalid_idempotent_request", message: "Same idempotency key used with a different request payload." }, { status: 409 });
    });
    expect((await call("/api/calls/k8/invito", { method: "POST" }, cookie)).status).toBe(200);
    expect((await call("/api/calls/k8/invito", { method: "POST" }, cookie)).status).toBe(200);
    expect(inviate).toHaveLength(2);
    expect(inviate[0].chiave).toBe(inviate[1].chiave);
    const allegato = (i: number) => (inviate[i].body.attachments as { content: string }[])[0].content;
    expect(allegato(0)).toBe(allegato(1));
    const ics = new TextDecoder().decode(Uint8Array.from(atob(allegato(0)), (c) => c.charCodeAt(0))).replace(/\r\n /g, "");
    expect(ics).toContain("DTSTAMP:" + new Date(NOW).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "") + "\r\n");
    expect(ics).toContain("ORGANIZER:mailto:tommaso@mail.acceleriamo.it\r\n");
    expect(ics).toContain("RSVP=TRUE:mailto:luca@esempio.it\r\n");
    expect(await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'resend'").first()).toEqual({ ok: 1 });
  });

  it("un 409 senza chiave di idempotenza resta un errore", async () => {
    setEmailFetch(async () => Response.json({ name: "invalid_idempotent_request", message: "conflict" }, { status: 409 }));
    const r = await inviaEmail({ ...env, RESEND_API_KEY: "re_test" } as Env, { from: "a@b.it", to: "c@d.it", subject: "s", text: "t" });
    expect(r.ok).toBe(false);
  });
});

describe("piede e mittente", () => {
  it("la riga legale non si ripete", () => {
    const gia = `Ciao,\n${PIEDE_LEGALE}. Informativa privacy: https://acceleriamo.it/privacy\nSaluti`;
    expect(conPiede(gia)).toBe(gia);
    expect(conPiede("Ciao")).toBe(`Ciao\n\n${PIEDE_LEGALE}`);
  });
  it("il piede predefinito contiene già la riga legale: una volta sola nell'invito", async () => {
    const cookie = await authed();
    await insertLead("l9");
    let testo = "";
    setEmailFetch(async (_url, init) => { testo = String(JSON.parse(String(init?.body)).text); return Response.json({ id: "e9" }); });
    await call("/api/leads/l9/calls", { method: "POST", json: { kind: "conoscenza", scheduledAt: DOMANI, meetLink: null, invito: true } }, cookie);
    expect(testo.split(PIEDE_LEGALE).length - 1).toBe(1);
  });
  it("indirizzo dal mittente", () => {
    expect(indirizzoDi("Tommaso di Acceleriamo <tommaso@mail.acceleriamo.it>")).toBe("tommaso@mail.acceleriamo.it");
    expect(indirizzoDi("tommaso@mail.acceleriamo.it")).toBe("tommaso@mail.acceleriamo.it");
  });
});
