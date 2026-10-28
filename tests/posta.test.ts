import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setEmailFetch } from "../worker/email/fetcher";
import { leggiInvito } from "../worker/posta/ics";
import { leggiRichiestaSito } from "../worker/posta/modulo";
import { soloParteNuova } from "../worker/posta/service";
import { call, createUser } from "./helpers";
import { ICS_GOOGLE, MODULO_SITO, MODULO_TABELLA, RISPOSTA_LEAD } from "./fixtures/posta";

const NOW = Date.now();
const CHIAVE = "chiave-posta-test";
// 5 novembre 2026, 10:00 a Roma = 09:00 UTC (ora solare).
const ALLE_10 = Date.UTC(2026, 10, 5, 9, 0);

async function insertLead(id: string, company: string, extra: Record<string, unknown> = {}) {
  const row = { id, company, source: "meta", stage_id: "da-chiamare-prima-volta", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}
let n = 0;
const mail = (extra: Record<string, unknown>) => ({ messageId: `<finta-${++n}@prova.it>`, data: NOW, da: { email: "calendar-notification@google.com", nome: "Google Calendar" }, oggetto: "", testo: "", ...extra });
const posta = (corpo: unknown, chiave = CHIAVE) => call("/api/hooks/posta", { method: "POST", json: corpo, headers: { authorization: `Bearer ${chiave}` } });
const tutte = <T>(q: string, ...b: unknown[]) => env.DB.prepare(q).bind(...b).all<T>().then((r) => r.results);

let mandate = 0;
beforeEach(async () => {
  mandate = 0;
  setEmailFetch(async () => { mandate++; return Response.json({ id: "finta" }); });
  await createUser("tommaso.rovini", "password-lunga-1", "Tommaso");
});
afterEach(() => setEmailFetch(null));

describe("lettura dell'invito di Google", () => {
  it("fuso di Roma, durata, link Meet, partecipanti, righe ripiegate", () => {
    const inv = leggiInvito(ICS_GOOGLE())!;
    expect(inv).toMatchObject({ metodo: "REQUEST", uid: "abc123finto@google.com", versione: 0, inizio: ALLE_10, durataMin: 45, link: "https://meet.google.com/abc-defg-hij" });
    expect(inv.partecipanti.map((p) => p.email)).toEqual(["mario@officina-rossi-finta.it", "tommaso@acceleriamo.it"]);
    expect(inv.partecipanti[0].nome).toBe("Mario Rossi");
  });
  it("ora legale e orario in UTC", () => {
    expect(leggiInvito(ICS_GOOGLE({ inizio: "20260715T100000", fine: "20260715T110000" }))!.inizio).toBe(Date.UTC(2026, 6, 15, 8, 0));
    const utc = ICS_GOOGLE().replace("DTSTART;TZID=Europe/Rome:20261105T100000", "DTSTART:20261105T090000Z").replace("DTEND;TZID=Europe/Rome:20261105T104500", "DURATION:PT1H");
    expect(leggiInvito(utc)).toMatchObject({ inizio: ALLE_10, durataMin: 60 });
  });
  it("evento di un giorno intero o senza UID: niente invito", () => {
    expect(leggiInvito(ICS_GOOGLE().replace("DTSTART;TZID=Europe/Rome:20261105T100000", "DTSTART;VALUE=DATE:20261105"))).toBeNull();
    expect(leggiInvito("BEGIN:VCALENDAR\r\nEND:VCALENDAR")).toBeNull();
  });
});

describe("porta della posta", () => {
  it("chiave sbagliata o assente: 401, niente scritto", async () => {
    expect((await posta(mail({ calendario: ICS_GOOGLE() }), "sbagliata")).status).toBe(401);
    expect((await call("/api/hooks/posta", { method: "POST", json: mail({}) })).status).toBe(401);
    expect(await tutte("SELECT * FROM mail_lette")).toHaveLength(0);
  });
  it("corpo non valido: 400", async () => {
    expect((await posta({ messageId: "x" })).status).toBe(400);
  });
});

describe("inviti Meet sulla call del lead", () => {
  it("abbinato per email: call creata con data, durata e link, fase proposta da confermare; la stessa mail due volte non duplica", async () => {
    await insertLead("rossi", "Officina Rossi Finta", { email: "Mario@Officina-Rossi-Finta.it", email_norm: "mario@officina-rossi-finta.it" });
    const m = mail({ calendario: ICS_GOOGLE(), oggetto: "Invito: Acceleriamo x Officina Rossi Finta" });
    const r = await posta(m);
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ tipo: "invito", esito: "call creata", leadId: "rossi" });
    const c = await tutte<Record<string, unknown>>("SELECT * FROM calls WHERE lead_id = 'rossi'");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "conoscenza", scheduled_at: ALLE_10, duration_min: 45, meet_link: "https://meet.google.com/abc-defg-hij", ics_uid: "abc123finto@google.com" });
    // Blocco 1, modifica 12: la fase non cambia da sola, l'invito diventa una proposta da confermare.
    expect(await env.DB.prepare("SELECT stage_id FROM leads WHERE id = 'rossi'").first("stage_id")).toBe("da-chiamare-prima-volta");
    expect(await tutte("SELECT body, outcome, call_id FROM activities WHERE lead_id = 'rossi' AND type = 'invito_proposta'"))
      .toEqual([{ body: expect.stringMatching(/^Il cliente ha accettato la call di .+: conferma$/), outcome: "da_confermare", call_id: c[0].id }]);
    expect((await posta(m)).status).toBe(200);
    expect(await tutte("SELECT * FROM calls WHERE lead_id = 'rossi'")).toHaveLength(1);
  });

  it("invito aggiornato (versione nuova, ora diversa): sposta la stessa call; una versione vecchia arrivata dopo non la tocca", async () => {
    await insertLead("rossi", "Officina Rossi Finta", { email_norm: "mario@officina-rossi-finta.it" });
    await posta(mail({ calendario: ICS_GOOGLE() }));
    const r = await posta(mail({ calendario: ICS_GOOGLE({ seq: 2, inizio: "20261106T153000", fine: "20261106T163000" }) }));
    expect(await r.json()).toMatchObject({ esito: "call spostata" });
    await posta(mail({ calendario: ICS_GOOGLE({ seq: 1, inizio: "20261107T090000", fine: "20261107T100000" }) }));
    const c = await tutte<Record<string, unknown>>("SELECT * FROM calls WHERE lead_id = 'rossi'");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ scheduled_at: Date.UTC(2026, 10, 6, 14, 30), duration_min: 60, ics_sequence: 2 });
  });

  it("call già fissata a mano: l'invito la completa invece di crearne un'altra", async () => {
    await insertLead("rossi", "Officina Rossi Finta", { email_norm: "mario@officina-rossi-finta.it", stage_id: "in-attesa-preventivo" });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k1', 'rossi', 'presentazione', ?, ?, ?)").bind(ALLE_10, NOW, NOW).run();
    expect(await (await posta(mail({ calendario: ICS_GOOGLE() }))).json()).toMatchObject({ esito: "call aggiornata" });
    expect(await env.DB.prepare("SELECT * FROM calls WHERE id = 'k1'").first()).toMatchObject({ duration_min: 45, meet_link: "https://meet.google.com/abc-defg-hij", ics_uid: "abc123finto@google.com" });
    expect(await tutte("SELECT * FROM calls")).toHaveLength(1);
  });

  it("dopo la consulenza fatta l'invito nuovo è la presentazione", async () => {
    await insertLead("rossi", "Officina Rossi Finta", { email_norm: "mario@officina-rossi-finta.it", stage_id: "in-attesa-preventivo" });
    await posta(mail({ calendario: ICS_GOOGLE() }));
    expect(await env.DB.prepare("SELECT kind FROM calls WHERE lead_id = 'rossi'").first("kind")).toBe("presentazione");
    expect(await env.DB.prepare("SELECT stage_id FROM leads WHERE id = 'rossi'").first("stage_id")).toBe("in-attesa-preventivo");
    expect(await tutte("SELECT outcome FROM activities WHERE lead_id = 'rossi' AND type = 'invito_proposta'")).toEqual([{ outcome: "da_confermare" }]);
  });

  it("senza email nota: abbinato per nome del partecipante", async () => {
    await insertLead("rossi", "Officina Rossi Finta", { contact_name: "Mario Rossi" });
    const r = await posta(mail({ calendario: ICS_GOOGLE({ partecipanti: ["ATTENDEE;CN=Mario Rossi:mailto:mario.rossi@gmail.com"], titolo: "Consulenza" }) }));
    expect(await r.json()).toMatchObject({ esito: "call creata", leadId: "rossi" });
  });

  it("senza email nota: abbinato per azienda nel titolo", async () => {
    await insertLead("rossi", "Officina Rossi Finta S.r.l.");
    const r = await posta(mail({ calendario: ICS_GOOGLE({ partecipanti: ["ATTENDEE;CN=Ufficio:mailto:info@altro-finto.it"] }) }));
    expect(await r.json()).toMatchObject({ esito: "call creata", leadId: "rossi" });
  });

  it("nessun lead o più lead possibili: avviso nel gestionale, nessuna call inventata", async () => {
    await insertLead("a1", "Bar Uno Finto", { contact_name: "Mario Rossi" });
    await insertLead("a2", "Bar Due Finto", { contact_name: "Mario Rossi" });
    const r = await posta(mail({ calendario: ICS_GOOGLE({ partecipanti: ["ATTENDEE;CN=Mario Rossi:mailto:mr@sconosciuto-finto.it"], titolo: "Call" }) }));
    expect(await r.json()).toMatchObject({ tipo: "invito", esito: "da abbinare" });
    expect(await tutte("SELECT * FROM calls")).toHaveLength(0);
    const avvisi = await tutte<{ evento: string; titolo: string; testo: string }>("SELECT evento, titolo, testo FROM notifications");
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0].titolo).toBe("Invito Meet senza lead: Call");
    expect(avvisi[0].testo).toContain("Più lead possibili");
    expect(avvisi[0].testo).toContain("mr@sconosciuto-finto.it");
  });

  it("invito annullato: la call resta, nel lead una riga che va riprogrammata", async () => {
    await insertLead("rossi", "Officina Rossi Finta", { email_norm: "mario@officina-rossi-finta.it" });
    await posta(mail({ calendario: ICS_GOOGLE() }));
    expect(await (await posta(mail({ calendario: ICS_GOOGLE({ metodo: "CANCEL", seq: 1 }) }))).json()).toMatchObject({ esito: "annullata" });
    expect(await tutte("SELECT * FROM calls WHERE deleted_at IS NULL")).toHaveLength(1);
    const righe = await tutte<{ body: string }>("SELECT body FROM activities WHERE lead_id = 'rossi' AND type = 'call'");
    expect(righe.some((x) => x.body.includes("va riprogrammata"))).toBe(true);
  });
});

describe("richieste dal modulo del sito", () => {
  it("lettura del modulo, anche a tabella e senza email", () => {
    expect(leggiRichiestaSito(MODULO_SITO)).toMatchObject({ nome: "Giulia Neri", azienda: "Carpenteria Neri Finta", email: "giulia@carpenteria-neri-finta.it", telefono: "347 123 4567", ruolo: "Titolare" });
    expect(leggiRichiestaSito(MODULO_SITO)!.risposte[0]).toEqual({ etichetta: "Cosa fa perdere più tempo", valore: "Fare i preventivi" });
    expect(leggiRichiestaSito(MODULO_TABELLA)).toMatchObject({ nome: "Paolo Bruni", azienda: "Autotrasporti Bruni Finti", email: null, telefono: "+39 333 987 6543" });
    expect(leggiRichiestaSito(RISPOSTA_LEAD)).toBeNull();
  });

  it("diventa un lead nuovo (fonte Sito) con le risposte nelle note; rimandata non duplica; stessa persona di nuovo: attività sul lead esistente", async () => {
    const prima = mail({ da: { email: "noreply@acceleriamo.it" }, oggetto: "Nuova richiesta dal sito", testo: MODULO_SITO });
    const r = await posta(prima);
    const corpo = await r.json() as { esito: string; leadId: string };
    expect(corpo.esito).toBe("lead creato");
    const lead = await env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(corpo.leadId).first<Record<string, unknown>>();
    expect(lead).toMatchObject({ company: "Carpenteria Neri Finta", contact_name: "Giulia Neri", source: "sito", email_norm: "giulia@carpenteria-neri-finta.it", phone_norm: "3471234567" });
    expect(String(lead!.notes)).toContain("Cosa fa perdere più tempo: Fare i preventivi");
    // Stessa mail rimandata dal lettore: niente doppione.
    expect((await posta(prima)).status).toBe(200);
    // Nuova richiesta con lo stesso telefono: nessun lead nuovo, una riga sul lead.
    const r2 = await posta(mail({ testo: MODULO_SITO.replace("giulia@carpenteria-neri-finta.it", "") }));
    expect(await r2.json()).toMatchObject({ esito: "lead già presente", leadId: corpo.leadId });
    expect(await tutte("SELECT * FROM leads")).toHaveLength(1);
    const contatti = await tutte<{ body: string }>("SELECT body FROM activities WHERE type = 'contatto'");
    expect(contatti).toHaveLength(1);
    // Stessa regola dei doppioni di Meta, a mano e CSV (blocco 1, modifica 8): storico "Arrivato di nuovo" e punteggio alzato.
    expect(contatti[0].body).toMatch(/^Arrivato di nuovo da modulo del sito\n/);
    expect(contatti[0].body).toContain("Cosa fa perdere più tempo: Fare i preventivi");
    expect((await env.DB.prepare("SELECT score FROM leads WHERE id = ?").bind(corpo.leadId).first<{ score: string }>())!.score).not.toBeNull();
    expect(await tutte("SELECT * FROM notifications WHERE evento = 'lead_nuovo'")).toHaveLength(1);
  });
});

describe("risposte dei lead", () => {
  it("mail da un indirizzo di un lead: attività con la sola parte nuova", async () => {
    await insertLead("rossi", "Officina Rossi Finta", { email_norm: "mario@officina-rossi-finta.it" });
    const m = mail({ da: { email: "Mario@officina-rossi-finta.it", nome: "Mario Rossi" }, oggetto: "Re: Consulenza", testo: RISPOSTA_LEAD });
    expect(await (await posta(m)).json()).toMatchObject({ tipo: "risposta", leadId: "rossi" });
    await posta(m);
    const righe = await tutte<{ body: string; type: string }>("SELECT body, type FROM activities WHERE lead_id = 'rossi'");
    expect(righe).toHaveLength(1);
    expect(righe[0].body).toBe("Mail ricevuta: Re: Consulenza\n\nBuongiorno Tommaso,\nva bene giovedì, vi aspetto.\n\nMario");
  });

  it("mittente sconosciuto o nostro: ignorata, niente scritto nel lead", async () => {
    await insertLead("rossi", "Officina Rossi Finta", { email_norm: "tommaso@acceleriamo.it" });
    expect(await (await posta(mail({ da: { email: "newsletter@fornitore-finto.it" }, testo: "Offerta" }))).json()).toMatchObject({ tipo: "altro", esito: "ignorata" });
    expect(await (await posta(mail({ da: { email: "tommaso@acceleriamo.it" }, testo: "nota" }))).json()).toMatchObject({ tipo: "altro" });
    expect(await tutte("SELECT * FROM activities")).toHaveLength(0);
  });

  it("taglio delle citazioni in inglese", () => {
    expect(soloParteNuova("Ok thanks\n\nOn Mon, Oct 26 wrote:\n> old")).toBe("Ok thanks");
  });
});

// Le stesse mail finte su file (scripts/posta/fixture), passate dal lettore Python: il JSON che il gestionale riceve davvero.
// Si rigenera con: python3 scripts/posta/leggi_posta.py --file scripts/posta/fixture/<nome>.eml
import DA_EML from "./fixtures/posta-da-eml.json";

describe("dal lettore della casella al gestionale", () => {
  it("invito, modulo HTML del sito e risposta: call, lead nuovo e attività", async () => {
    await insertLead("rossi", "Officina Rossi Finta", { email_norm: "mario@officina-rossi-finta.it" });
    const [invitoG, moduloS, rispostaL] = DA_EML;
    expect(await (await posta(invitoG)).json()).toMatchObject({ tipo: "invito", esito: "call creata", leadId: "rossi" });
    expect(await env.DB.prepare("SELECT duration_min, meet_link, scheduled_at FROM calls WHERE lead_id = 'rossi'").first()).toEqual({ duration_min: 45, meet_link: "https://meet.google.com/abc-defg-hij", scheduled_at: ALLE_10 });
    const m = await (await posta(moduloS)).json() as { esito: string; leadId: string };
    expect(m.esito).toBe("lead creato");
    expect(await env.DB.prepare("SELECT company, contact_name, email_norm, phone_norm, source FROM leads WHERE id = ?").bind(m.leadId).first())
      .toEqual({ company: "Carpenteria Neri Finta", contact_name: "Giulia Neri", email_norm: "giulia@carpenteria-neri-finta.it", phone_norm: "3471234567", source: "sito" });
    expect(await (await posta(rispostaL)).json()).toMatchObject({ tipo: "risposta", leadId: "rossi" });
  });
});
