import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { daRoma, partiRoma } from "../lib/roma";
import { conScadenzaSla } from "../regole/sla";
import { leggiImpostazioni } from "../impostazioni/service";
import { scegliAdesso } from "./adesso";
import type { CallOggi, Oggi, PropostaOggi, RigaOggi } from "./tipi";

type CallGrezza = Omit<CallOggi, "scheda"> & { schedaStato: string | null };

const GIORNO = 86_400_000;
const FROM = "FROM leads l JOIN stages s ON s.id = l.stage_id";

// Colonne di RigaOggi (slaScadenza si calcola dopo).
const COLONNE = `l.id, l.company, l.contact_name AS contactName, l.phone, l.email, l.stage_id AS stageId, s.label AS stageLabel,
  l.next_action AS nextAction, l.next_action_at AS nextActionAt, l.stage_changed_at AS stageChangedAt, l.owner_id AS ownerId,
  l.score, l.attempt_count AS attemptCount, l.created_at AS createdAt, l.setup_cents AS setupCents, l.fee_cents AS feeCents`;
const APERTI = "l.deleted_at IS NULL AND s.kind = 'open'";

const oggiSchema = z.object({
  chi: z.enum(["mie", "tutte"]).default("mie"),
  now: z.coerce.number().int().optional(),
});

const parametro = (params: string | undefined, chiave: string): number | undefined => {
  if (!params) return undefined;
  try {
    const v = (JSON.parse(params) as Record<string, unknown>)[chiave];
    return typeof v === "number" ? v : undefined;
  } catch {
    return undefined;
  }
};

export const todayRoutes = new Hono<AppEnv>();

// Spec 6.4 e 6.5: una query per gruppo, mai una per riga. I giorni si contano sul fuso di Roma.
// La stessa funzione dà le righe di Oggi e il numero del badge (un solo conteggio).
export async function calcolaOggi(db: D1Database, io: string, chiScelto: "mie" | "tutte", ora: number): Promise<Oggi> {
  // ?1 è sempre l'utente; per "Tutte" la condizione ?1 = ?1 lo consuma senza filtrare.
  const chi = chiScelto === "mie" ? "AND (l.owner_id = ?1 OR l.owner_id IS NULL)" : "AND ?1 = ?1";
  const p = partiRoma(ora);
  const inizio = daRoma(p.anno, p.mese, p.giorno);
  const fine = daRoma(p.anno, p.mese, p.giorno + 1);
  const scartoLunedi = (p.settimana + 6) % 7;
  const lunedi = daRoma(p.anno, p.mese, p.giorno - scartoLunedi);
  const lunediDopo = daRoma(p.anno, p.mese, p.giorno - scartoLunedi + 7);
  const tutti = <T,>(sql: string, ...b: unknown[]) => db.prepare(sql).bind(io, ...b).all<T>().then((r) => r.results);
  const uno = <T,>(sql: string, ...b: unknown[]) => db.prepare(sql).bind(...b).first<T>();

  const [imp, regole] = await Promise.all([
    leggiImpostazioni(getDb(db)),
    db.prepare("SELECT rule_key AS ruleKey, params FROM stage_rules WHERE rule_key IN ('sla', 'fermo') AND active = 1").all<{ ruleKey: string; params: string }>(),
  ]);
  const regola = (k: string) => regole.results.find((r) => r.ruleKey === k)?.params;
  const minutiSla = parametro(regola("sla"), "minuti") ?? 120;
  const giorniFermo = parametro(regola("fermo"), "giorni") ?? 7;

  const [nuoviGrezzi, dovuti, proposte, fermiGrezzi, callGrezze, leadNuovi, primaRisposta, callSettimana, proposteAperte] = await Promise.all([
    tutti<RigaOggi>(`SELECT ${COLONNE} ${FROM} WHERE ${APERTI} ${chi} AND l.stage_id = 'da-chiamare-prima-volta' ORDER BY l.created_at`),
    tutti<RigaOggi>(`SELECT ${COLONNE} ${FROM}
      WHERE ${APERTI} ${chi} AND l.next_action_at IS NOT NULL AND l.next_action_at < ?2 ORDER BY l.next_action_at`, fine),
    tutti<PropostaOggi>(`SELECT p.id, p.number, p.status, l.id AS leadId, l.company, l.contact_name AS contactName, l.email, l.phone,
        p.setup_cents AS setupCents, p.fee_cents AS feeCents, l.next_action_at AS nextActionAt
      FROM proposals p JOIN leads l ON l.id = p.lead_id JOIN stages s ON s.id = l.stage_id
      WHERE ${APERTI} ${chi} AND p.deleted_at IS NULL
        AND (p.status = 'registrata' OR (p.status = 'presentata' AND l.stage_id = 'in-attesa-decisione' AND l.next_action_at < ?2))
      ORDER BY l.next_action_at`, fine),
    // I nuovi hanno già il loro gruppo, i bloccati sono in pausa: nessuno dei due è "fermo".
    tutti<RigaOggi>(`SELECT ${COLONNE} ${FROM}
      WHERE ${APERTI} ${chi} AND l.stage_id NOT IN ('probabilmente-bloccato', 'da-chiamare-prima-volta')
        AND l.stage_changed_at <= ?2 ORDER BY l.stage_changed_at LIMIT 20`, ora - giorniFermo * GIORNO),
    tutti<CallGrezza>(`SELECT k.id, k.lead_id AS leadId, l.company, l.contact_name AS contactName, l.phone, k.kind, k.scheduled_at AS scheduledAt, k.meet_link AS meetLink,
        -- Come statoScheda: durante "Rigenera" resta pronta se una versione pronta c'è già.
        CASE WHEN EXISTS (SELECT 1 FROM company_profiles cp WHERE cp.lead_id = l.id AND cp.status = 'ready') THEN 'ready'
          ELSE (SELECT cp.status FROM company_profiles cp WHERE cp.lead_id = l.id ORDER BY cp.version DESC LIMIT 1) END AS schedaStato
      FROM calls k JOIN leads l ON l.id = k.lead_id WHERE k.deleted_at IS NULL AND l.deleted_at IS NULL ${chi}
        AND k.scheduled_at >= ?2 AND k.scheduled_at < ?3 ORDER BY k.scheduled_at`, inizio, fine),
    uno<{ n: number }>("SELECT count(*) n FROM leads WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?", inizio, fine),
    uno<{ m: number | null }>("SELECT avg(first_response_at - created_at) / 60000.0 m FROM leads WHERE deleted_at IS NULL AND first_response_at IS NOT NULL AND created_at >= ?", ora - 7 * GIORNO),
    uno<{ n: number }>("SELECT count(*) n FROM calls k JOIN leads l ON l.id = k.lead_id AND l.deleted_at IS NULL WHERE k.deleted_at IS NULL AND k.scheduled_at >= ? AND k.scheduled_at < ?", lunedi, lunediDopo),
    uno<{ n: number }>("SELECT count(*) n FROM proposals p JOIN leads l ON l.id = p.lead_id AND l.deleted_at IS NULL WHERE p.deleted_at IS NULL AND p.status IN ('registrata', 'presentata')"),
  ]);

  const callOggi: CallOggi[] = callGrezze.map(({ schedaStato, ...k }) => ({
    ...k,
    scheda: schedaStato === "ready" ? "pronta" : schedaStato === "queued" || schedaStato === "running" ? "in_preparazione" : null,
  }));

  // Stessa scadenza della Scaletta, dell'Elenco e della scheda (worker/regole/sla.ts).
  const nuoviTutti = nuoviGrezzi.map((l) => {
    const allineato = conScadenzaSla(l, { minuti: minutiSla, orario: imp.orario });
    return { ...allineato, slaScadenza: allineato.nextActionAt };
  });
  const idProposte = new Set(proposte.map((x) => x.leadId));
  const daFareTutti = dovuti
    .filter((l) => l.stageId !== "da-chiamare-prima-volta" && !idProposte.has(l.id) && l.stageId !== "probabilmente-bloccato")
    .map((l) => ({ ...l, slaScadenza: null }));
  const adesso = scegliAdesso({ nuovi: nuoviTutti, daFare: daFareTutti, call: callOggi }, ora);

  // Ogni lead compare una volta sola, nella sezione più urgente:
  // Adesso, poi lead nuovi, call di oggi (con l'orario e il Meet), da fare, proposte, fine pausa, fermi.
  const visti = new Set<string>();
  const prendi = <T,>(righe: T[], chiave: (r: T) => string) =>
    righe.filter((r) => {
      const k = chiave(r);
      if (visti.has(k)) return false;
      visti.add(k);
      return true;
    });
  if (adesso) visti.add(adesso.tipo === "call" ? adesso.leadId : adesso.id);
  const nuovi = prendi(nuoviTutti, (l) => l.id);
  const call = prendi(callOggi, (k) => k.leadId);
  const daFare = prendi(daFareTutti, (l) => l.id);
  // Un lead con proposta compare una volta sola: nel blocco proposte (con "Segna presentata" se registrata).
  const proposteVisibili = prendi(proposte, (x) => x.leadId);
  const finePausa = prendi(dovuti.filter((l) => l.stageId === "probabilmente-bloccato").map((l) => ({ ...l, slaScadenza: null })), (l) => l.id);
  // I fermi sono a scomparsa e non entrano nel totale.
  const fermi = prendi(fermiGrezzi.map((l) => ({ ...l, slaScadenza: null })), (l) => l.id);

  const m = primaRisposta?.m ?? null;
  return {
    adesso,
    nuovi, daFare, call, proposte: proposteVisibili, fermi, finePausa,
    numeri: {
      leadNuovi: leadNuovi?.n ?? 0,
      primaRispostaMinuti: m == null ? null : Math.round(m),
      callSettimana: callSettimana?.n ?? 0,
      proposteAperte: proposteAperte?.n ?? 0,
    },
    // Titolo e badge contano le righe davvero mostrate, Adesso compreso.
    totale: (adesso ? 1 : 0) + nuovi.length + daFare.length + call.length + proposteVisibili.length + finePausa.length,
  };
}

todayRoutes.get("/today", async (c) => {
  const q = oggiSchema.parse(c.req.query());
  return c.json(await calcolaOggi(c.env.DB, c.get("user").id, q.chi, q.now ?? Date.now()));
});
