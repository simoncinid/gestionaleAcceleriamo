import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { giro, registraLavoro, LAVORI } from "../worker/cron";
import { getDb } from "../worker/db/client";
import { coloreVoce, daAvvisare, intervalloInParole, prossimoGiro } from "../worker/stato/calcoli";
import { controllaStato, potaStorico } from "../worker/stato/service";
import type { VoceStato, GiroStato } from "../worker/stato/routes";
import { authed, call } from "./helpers";

const MIN = 60_000;
const ORA = Date.UTC(2026, 9, 22, 8, 0);
const voce = (o: Partial<Parameters<typeof coloreVoce>[0]> = {}) => ({ attiva: true, intervalloMin: 60, ultimoEsito: "ok" as const, ultimoGiroAt: ORA - 10 * MIN, ...o });

describe("colore delle voci", () => {
  it("verde, giallo oltre intervallo e tolleranza, rosso in errore, grigio spenta o mai partita", () => {
    expect(coloreVoce(voce(), ORA)).toBe("verde");
    expect(coloreVoce(voce({ ultimoGiroAt: ORA - 90 * MIN }), ORA)).toBe("verde"); // 30 minuti di ritardo: dentro la metà dell'intervallo
    expect(coloreVoce(voce({ ultimoGiroAt: ORA - 91 * MIN }), ORA)).toBe("giallo");
    expect(coloreVoce(voce({ ultimoEsito: "errore" }), ORA)).toBe("rosso");
    expect(coloreVoce(voce({ ultimoEsito: "spento" }), ORA)).toBe("grigio");
    expect(coloreVoce(voce({ ultimoGiroAt: null }), ORA)).toBe("grigio");
    expect(coloreVoce(voce({ attiva: false, ultimoEsito: "errore" }), ORA)).toBe("grigio");
    // Lavoro di 5 minuti: tolleranza minima di 5 minuti.
    expect(coloreVoce(voce({ intervalloMin: 5, ultimoGiroAt: ORA - 10 * MIN }), ORA)).toBe("verde");
    expect(coloreVoce(voce({ intervalloMin: 5, ultimoGiroAt: ORA - 11 * MIN }), ORA)).toBe("giallo");
  });

  it("avviso in rosso subito, in giallo solo oltre il doppio dell'intervallo", () => {
    expect(daAvvisare(voce({ ultimoEsito: "errore" }), ORA)).toBe(true);
    expect(daAvvisare(voce({ ultimoGiroAt: ORA - 150 * MIN }), ORA)).toBe(false);
    expect(daAvvisare(voce({ ultimoGiroAt: ORA - 181 * MIN }), ORA)).toBe(true);
    expect(prossimoGiro(voce())).toBe(ORA + 50 * MIN);
  });

  it("intervallo in parole", () => {
    expect(intervalloInParole(5)).toBe("Ogni 5 minuti");
    expect(intervalloInParole(60)).toBe("Ogni ora");
    expect(intervalloInParole(360)).toBe("Ogni 6 ore");
    expect(intervalloInParole(1440)).toBe("Una volta al giorno");
    expect(intervalloInParole(10_080)).toBe("Una volta alla settimana");
  });
});

describe("esiti del giro", () => {
  it("ogni lavoro scrive il suo esito e il giro aggiorna anche la riga di Integrazioni", async () => {
    const salvati = { foglio: LAVORI.foglio!, meta: LAVORI.meta! };
    try {
      registraLavoro("foglio", { quando: () => true, fisse: 1, perUnita: 0, sottoPerUnita: 0, max: 1, esegui: async () => { throw new Error("foglio giù"); } });
      registraLavoro("meta", { quando: () => true, fisse: 1, perUnita: 0, sottoPerUnita: 0, max: 1, esegui: async () => 1 });
      await giro(env, ORA);
    } finally {
      registraLavoro("foglio", salvati.foglio);
      registraLavoro("meta", salvati.meta);
    }
    const voci = await env.DB.prepare("SELECT id, ultimo_esito AS esito, ultimo_errore AS errore, ultimo_ok_at AS ok FROM stato_voci WHERE id IN ('giro:foglio','giro:meta','giro')").all<{ id: string; esito: string; errore: string | null; ok: number | null }>();
    const per = Object.fromEntries(voci.results.map((v) => [v.id, v]));
    expect(per["giro:foglio"]).toMatchObject({ esito: "errore", errore: "foglio giù", ok: null });
    expect(per["giro:meta"]).toMatchObject({ esito: "ok", ok: ORA });
    expect(per.giro).toMatchObject({ esito: "errore" });
    const integrazione = await env.DB.prepare("SELECT ok, last_error AS errore, error_id AS codice FROM integration_status WHERE key = 'giro'").first<{ ok: number; errore: string; codice: string }>();
    expect(integrazione).toMatchObject({ ok: 0, errore: "foglio: foglio giù" });
    expect(integrazione!.codice).toMatch(/^[0-9a-f]{8}$/);

    // Giro dopo tutto bene: la riga torna verde e tiene l'ultimo errore per Impostazioni.
    const salvato = LAVORI.foglio!;
    try {
      registraLavoro("foglio", { quando: () => true, fisse: 1, perUnita: 0, sottoPerUnita: 0, max: 1, esegui: async () => 1 });
      await giro(env, ORA + 5 * MIN);
    } finally {
      registraLavoro("foglio", salvato);
    }
    expect(await env.DB.prepare("SELECT ok, last_ok_at AS okAt, last_error AS errore FROM integration_status WHERE key = 'giro'").first())
      .toEqual({ ok: 1, okAt: ORA + 5 * MIN, errore: "foglio: foglio giù" });
    expect(await env.DB.prepare("SELECT ultimo_esito AS esito, ultimo_errore AS errore FROM stato_voci WHERE id = 'giro:foglio'").first())
      .toEqual({ esito: "ok", errore: "foglio giù" });
  });

  it("un giro saltato resta nello storico ma non cambia l'ultimo esito", async () => {
    const db = getDb(env.DB);
    await env.DB.prepare("INSERT INTO stato_giri (voce_id, esito, at, messaggio) VALUES ('giro:meta', 'errore', ?1, 'Graph giù'), ('giro:meta', 'saltato', ?2, 'Budget')").bind(ORA, ORA + MIN).run();
    expect(await env.DB.prepare("SELECT ultimo_esito AS esito, ultimo_giro_at AS at FROM stato_voci WHERE id = 'giro:meta'").first()).toEqual({ esito: "errore", at: ORA });
    await potaStorico(db, ORA + 31 * 86_400_000);
    expect(await env.DB.prepare("SELECT count(*) n FROM stato_giri").first()).toEqual({ n: 0 });
  });
});

describe("automazioni esterne e battito", () => {
  it("la chiave si vede una volta, il battito aggiorna la voce, il passo dice dove si è rotta", async () => {
    const cookie = await authed();
    const crea = await call("/api/stato/voci", { method: "POST", json: { nome: "Schede lead sul server", intervalloMin: 60 } }, cookie);
    expect(crea.status).toBe(201);
    const { id, chiave } = (await crea.json()) as { id: string; chiave: string };
    expect(chiave).toMatch(/^bat_[\w-]{43}$/);
    const salvata = await env.DB.prepare("SELECT chiave_impronta AS impronta FROM stato_voci WHERE id = ?").bind(id).first<{ impronta: string }>();
    expect(salvata!.impronta).toMatch(/^[0-9a-f]{64}$/);
    expect(salvata!.impronta).not.toContain(chiave);

    const battito = (corpo: unknown, k = chiave) => call("/api/stato/battito", { method: "POST", json: corpo, headers: { authorization: `Bearer ${k}` } });
    expect((await battito({ esito: "ok" }, "bat_sbagliata")).status).toBe(401);
    expect((await call("/api/stato/battito", { method: "POST", json: { esito: "ok" } })).status).toBe(401);
    expect((await battito({ esito: "forse" })).status).toBe(400);
    expect((await battito({ esito: "ok", messaggio: "12 schede" })).status).toBe(200);
    expect((await battito({ esito: "errore", messaggio: "Timeout di Google", passo: "Scrittura nel foglio" })).status).toBe(200);

    const { voci } = (await (await call("/api/stato", {}, cookie)).json()) as { voci: VoceStato[] };
    const v = voci.find((x) => x.id === id)!;
    expect(v).toMatchObject({ nome: "Schede lead sul server", proprietario: "Acceleriamo", colore: "rosso", ultimoErrore: "Timeout di Google", ultimoPasso: "Scrittura nel foglio", tipo: "esterno" });
    expect(voci[0].id).toBe(id); // le rosse in cima
    // I lavori del giro ci sono anche prima del primo giro, grigi.
    expect(voci.find((x) => x.id === "giro:meta_recupero")).toMatchObject({ colore: "grigio", nome: "Lead Meta: recupero ogni 15 minuti" });

    const { giri } = (await (await call(`/api/stato/${id}/giri`, {}, cookie)).json()) as { giri: GiroStato[] };
    expect(giri.map((g) => g.esito)).toEqual(["errore", "ok"]);

    // Chiave nuova: la vecchia smette di valere.
    const { chiave: nuova } = (await (await call(`/api/stato/voci/${id}/chiave`, { method: "POST" }, cookie)).json()) as { chiave: string };
    expect((await battito({ esito: "ok" })).status).toBe(401);
    expect((await battito({ esito: "ok" }, nuova)).status).toBe(200);

    expect((await call(`/api/stato/voci/${id}`, { method: "PATCH", json: { attiva: false } }, cookie)).status).toBe(200);
    expect((await call(`/api/stato/voci/giro:meta`, { method: "PATCH", json: { attiva: false } }, cookie)).status).toBe(404);
    expect((await call(`/api/stato/voci/${id}`, { method: "DELETE" }, cookie)).status).toBe(200);
    expect((await battito({ esito: "ok" }, nuova)).status).toBe(401);
  });

  it("serve la sessione per tutto tranne il battito", async () => {
    expect((await call("/api/stato")).status).toBe(401);
    expect((await call("/api/stato/voci", { method: "POST", json: { nome: "x", intervalloMin: 5 } })).status).toBe(401);
  });
});

describe("avvisi dello stato", () => {
  it("un avviso per episodio: rosso subito, nessun doppione, chiuso al ritorno al verde", async () => {
    await authed();
    await env.DB.prepare("INSERT INTO stato_voci (id, tipo, nome, intervallo_min, attiva, chiave_impronta) VALUES ('m', 'esterno', 'Megaron, giri dei tecnici', 60, 1, 'x')").run();
    await env.DB.prepare("INSERT INTO stato_giri (voce_id, esito, at) VALUES ('m', 'ok', ?1)").bind(ORA - 30 * MIN).run();
    await env.DB.prepare("INSERT INTO stato_giri (voce_id, esito, at, messaggio, passo) VALUES ('m', 'errore', ?1, 'Gmail non risponde', 'Lettura delle email')").bind(ORA - 5 * MIN).run();
    expect(await controllaStato(env, ORA, 5)).toEqual({ creati: 1 });
    expect(await controllaStato(env, ORA + 15 * MIN, 5)).toEqual({ creati: 0 });
    const avviso = await env.DB.prepare("SELECT titolo, testo, href, entity_id AS chiave FROM notifications WHERE evento = 'automazione_rotta'").first();
    expect(avviso).toEqual({ titolo: "Automazione in errore: Megaron, giri dei tecnici", testo: "Gmail non risponde. Dove: Lettura delle email", href: "/automazioni/stato", chiave: `m:${ORA - 30 * MIN}` });
    await env.DB.prepare("INSERT INTO stato_giri (voce_id, esito, at) VALUES ('m', 'ok', ?1)").bind(ORA + 20 * MIN).run();
    await controllaStato(env, ORA + 30 * MIN, 5);
    expect(await env.DB.prepare("SELECT count(*) n FROM notifications WHERE evento = 'automazione_rotta' AND closed_at IS NULL").first()).toEqual({ n: 0 });
  });

  it("in giallo l'avviso parte solo oltre il doppio dell'intervallo", async () => {
    await authed();
    await env.DB.prepare("INSERT INTO stato_giri (voce_id, esito, at) VALUES ('giro:lavori', 'ok', ?1)").bind(ORA).run();
    expect(await controllaStato(env, ORA + 1440 * MIN + 13 * 60 * MIN, 5)).toEqual({ creati: 0 }); // giallo
    expect(await controllaStato(env, ORA + 3 * 1440 * MIN + MIN, 5)).toEqual({ creati: 1 });
    expect(await env.DB.prepare("SELECT titolo FROM notifications WHERE evento = 'automazione_rotta'").first()).toEqual({ titolo: "Automazione ferma: Task ricorrenti dei lavori" });
  });
});
