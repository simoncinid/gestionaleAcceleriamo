import { and, eq, isNull, sql } from "drizzle-orm";
import { avvisa } from "../avvisi/service";
import { getDb, type Db } from "../db/client";
import { statoVoci, type EsitoStato, type StatoVoce } from "../db/schema";
import type { Env } from "../env";
import { daAvvisare, coloreVoce } from "./calcoli";
import { GIRO, VOCE_GIRO, VOCE_WEBHOOK_META, VOCI_GIRO, WEBHOOK_META } from "./voci";

export type EsitoGiro = { voce: string; esito: EsitoStato; messaggio?: string | null; passo?: string | null };

const GIORNI_STORICO = 30;
const MAX_MESSAGGIO = 500;
const MAX_PASSO = 120;

const corto = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null);

// Esiti del giro e dei suoi lavori: una query sola, l'INSERT a più righe nello storico (5 parametri a riga, sotto il
// tetto di 100 di D1 con tutti i lavori). Le voci le aggiorna il trigger stato_giri_aggiorna_voce; la riga del giro
// intero anche Impostazioni > Integrazioni (trigger stato_giri_aggiorna_integrazione, migrazione 0014).
export async function scriviEsiti(db: Db, righe: EsitoGiro[], now: number) {
  if (!righe.length) return;
  const storico = righe.map((r) => sql`(${r.voce}, ${r.esito}, ${now}, ${corto(r.messaggio, MAX_MESSAGGIO)}, ${corto(r.passo, MAX_PASSO)})`);
  await db.run(sql`INSERT INTO stato_giri (voce_id, esito, at, messaggio, passo) VALUES ${sql.join(storico, sql`, `)}`);
}

// Una volta al giorno (giro delle 3): lo storico tiene 30 giorni, abbastanza per 20 giri dei lavori giornalieri.
export async function potaStorico(db: Db, now: number) {
  await db.run(sql`DELETE FROM stato_giri WHERE at < ${now - GIORNI_STORICO * 86_400_000}`);
}

export async function improntaChiave(chiave: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(chiave));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Chiave del battito: 32 byte casuali in base64url, prefisso "bat_" per riconoscerla. Si mostra una volta sola.
export function nuovaChiave(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return `bat_${btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

// Battito di un'automazione esterna: due query (voce dalla chiave, storico; la voce la aggiorna il trigger).
// null = chiave sconosciuta.
export async function registraBattito(db: Db, chiave: string, b: { esito: "ok" | "errore"; messaggio?: string | null; passo?: string | null }, now: number) {
  const impronta = await improntaChiave(chiave);
  const voce = await db.select({ id: statoVoci.id }).from(statoVoci)
    .where(and(eq(statoVoci.chiaveImpronta, impronta), eq(statoVoci.tipo, "esterno"), isNull(statoVoci.eliminataIl))).get();
  if (!voce) return null;
  await db.run(sql`INSERT INTO stato_giri (voce_id, esito, at, messaggio, passo)
    VALUES (${voce.id}, ${b.esito}, ${now}, ${corto(b.messaggio, MAX_MESSAGGIO)}, ${corto(b.passo, MAX_PASSO)})`);
  return voce.id;
}

const interna = (id: string): { nome: string; intervalloMin: number | null } | undefined =>
  id === VOCE_GIRO ? GIRO : id === VOCE_WEBHOOK_META ? WEBHOOK_META : VOCI_GIRO[id.replace(/^giro:/, "") as keyof typeof VOCI_GIRO];
export const nomeVoce = (v: Pick<StatoVoce, "id" | "nome">) => v.nome ?? interna(v.id)?.nome ?? v.id;
export const intervalloVoce = (v: Pick<StatoVoce, "id" | "intervalloMin">) => v.intervalloMin ?? interna(v.id)?.intervalloMin ?? null;

// Lavoro "stato" del giro: un avviso per episodio quando una voce va in rosso o resta gialla oltre il doppio
// dell'intervallo. Episodio = voce più ultimo giro riuscito (come "Integrazione rotta"): cambia solo dopo un
// ritorno al verde, che chiude l'avviso. Costo: 3 fisse (voci, avvisi aperti, chiusura) più un INSERT per avviso nuovo.
export const COSTO_STATO = { fisse: 3, perUnita: 1, max: 5 } as const;

export async function controllaStato(env: Env, now: number, limite: number): Promise<{ creati: number }> {
  const db = getDb(env.DB);
  const [voci, aperti] = await Promise.all([
    db.all<StatoVoce>(sql`SELECT id, nome, intervallo_min AS intervalloMin, attiva, ultimo_esito AS ultimoEsito, ultimo_giro_at AS ultimoGiroAt,
        ultimo_ok_at AS ultimoOkAt, ultimo_errore AS ultimoErrore, ultimo_passo AS ultimoPasso
      FROM stato_voci WHERE eliminata_il IS NULL`),
    db.all<{ entityId: string }>(sql`SELECT DISTINCT entity_id AS entityId FROM notifications WHERE evento = 'automazione_rotta' AND closed_at IS NULL`),
  ]);
  const rotte = voci
    .map((v) => ({ ...v, attiva: Boolean(v.attiva), intervalloMin: intervalloVoce(v) }))
    .filter((v) => daAvvisare(v, now))
    .map((v) => ({ v, chiave: `${v.id}:${v.ultimoOkAt ?? 0}` }));
  const daTenere = new Set(rotte.map((r) => r.chiave));
  const daChiudere = aperti.map((a) => a.entityId).filter((k) => !daTenere.has(k));
  if (daChiudere.length) {
    await db.run(sql`UPDATE notifications SET closed_at = ${now} WHERE evento = 'automazione_rotta' AND closed_at IS NULL
      AND entity_id IN (${sql.join(daChiudere.map((k) => sql`${k}`), sql`, `)})`);
  }
  const giaAperti = new Set(aperti.map((a) => a.entityId));
  let creati = 0;
  for (const { v, chiave } of rotte.filter((r) => !giaAperti.has(r.chiave)).slice(0, limite)) {
    const rosso = coloreVoce(v, now) === "rosso";
    const nome = nomeVoce(v);
    const testo = rosso ? [v.ultimoErrore, v.ultimoPasso ? `Dove: ${v.ultimoPasso}` : null].filter(Boolean).join(". ") || undefined : "Non si sente da più del doppio del previsto.";
    creati += await avvisa(db, { evento: "automazione_rotta", entityId: chiave, titolo: rosso ? `Automazione in errore: ${nome}` : `Automazione ferma: ${nome}`, testo, href: "/automazioni/stato" }, now);
  }
  return { creati };
}
