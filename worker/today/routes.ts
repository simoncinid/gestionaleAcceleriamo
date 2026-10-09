import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { daRoma, partiRoma } from "../lib/roma";
import { scadenzaLavorativa } from "../regole/orario";
import { leggiImpostazioni } from "../impostazioni/service";
import { scegliAdesso } from "./adesso";
import type { CallOggi, Oggi, PropostaOggi, RigaOggi } from "./tipi";

const GIORNO = 86_400_000;
const HUMAN_TYPES = "('nota','chiamata','email','cambio_fase')";
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
const statsSchema = z.object({
  from: z.coerce.number().int().default(0),
  until: z.coerce.number().int().default(Number.MAX_SAFE_INTEGER),
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
todayRoutes.get("/today", async (c) => {
  const q = oggiSchema.parse(c.req.query());
  const db = c.env.DB;
  const ora = q.now ?? Date.now();
  const io = c.get("user").id;
  // ?1 è sempre l'utente; per "Tutte" la condizione ?1 = ?1 lo consuma senza filtrare.
  const chi = q.chi === "mie" ? "AND (l.owner_id = ?1 OR l.owner_id IS NULL)" : "AND ?1 = ?1";
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

  const [nuoviGrezzi, dovuti, proposte, fermiGrezzi, callOggi, leadNuovi, primaRisposta, callSettimana, proposteAperte] = await Promise.all([
    tutti<RigaOggi>(`SELECT ${COLONNE} ${FROM} WHERE ${APERTI} ${chi} AND l.stage_id = 'da-chiamare-prima-volta' ORDER BY l.created_at`),
    tutti<RigaOggi>(`SELECT ${COLONNE} ${FROM}
      WHERE ${APERTI} ${chi} AND l.next_action_at IS NOT NULL AND l.next_action_at < ?2 ORDER BY l.next_action_at`, fine),
    tutti<PropostaOggi>(`SELECT p.id, p.number, p.status, l.id AS leadId, l.company, l.contact_name AS contactName, l.email, l.phone,
        p.setup_cents AS setupCents, p.fee_cents AS feeCents, l.next_action_at AS nextActionAt
      FROM proposals p JOIN leads l ON l.id = p.lead_id JOIN stages s ON s.id = l.stage_id
      WHERE ${APERTI} ${chi} AND p.deleted_at IS NULL AND p.status IN ('registrata', 'presentata')
        AND l.stage_id = 'in-attesa-decisione' AND l.next_action_at < ?2 ORDER BY l.next_action_at`, fine),
    // I nuovi hanno già il loro gruppo, i bloccati sono in pausa: nessuno dei due è "fermo".
    tutti<RigaOggi>(`SELECT ${COLONNE} ${FROM}
      WHERE ${APERTI} ${chi} AND l.stage_id NOT IN ('probabilmente-bloccato', 'da-chiamare-prima-volta')
        AND l.stage_changed_at <= ?2 ORDER BY l.stage_changed_at LIMIT 20`, ora - giorniFermo * GIORNO),
    tutti<CallOggi>(`SELECT k.id, k.lead_id AS leadId, l.company, l.contact_name AS contactName, l.phone, k.kind, k.scheduled_at AS scheduledAt, k.meet_link AS meetLink
      FROM calls k JOIN leads l ON l.id = k.lead_id WHERE k.deleted_at IS NULL AND l.deleted_at IS NULL ${chi}
        AND k.scheduled_at >= ?2 AND k.scheduled_at < ?3 ORDER BY k.scheduled_at`, inizio, fine),
    uno<{ n: number }>("SELECT count(*) n FROM leads WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?", inizio, fine),
    uno<{ m: number | null }>("SELECT avg(first_response_at - created_at) / 60000.0 m FROM leads WHERE deleted_at IS NULL AND first_response_at IS NOT NULL AND created_at >= ?", ora - 7 * GIORNO),
    uno<{ n: number }>("SELECT count(*) n FROM calls k JOIN leads l ON l.id = k.lead_id AND l.deleted_at IS NULL WHERE k.deleted_at IS NULL AND k.scheduled_at >= ? AND k.scheduled_at < ?", lunedi, lunediDopo),
    uno<{ n: number }>("SELECT count(*) n FROM proposals p JOIN leads l ON l.id = p.lead_id AND l.deleted_at IS NULL WHERE p.deleted_at IS NULL AND p.status IN ('registrata', 'presentata')"),
  ]);

  const nuovi = nuoviGrezzi.map((l) => ({ ...l, slaScadenza: scadenzaLavorativa(l.createdAt, minutiSla, imp.orario) }));
  const idNuovi = new Set(nuovi.map((l) => l.id));
  const idProposte = new Set(proposte.map((x) => x.leadId));
  const finePausa = dovuti.filter((l) => l.stageId === "probabilmente-bloccato").map((l) => ({ ...l, slaScadenza: null }));
  const daFare = dovuti
    .filter((l) => !idNuovi.has(l.id) && !idProposte.has(l.id) && l.stageId !== "probabilmente-bloccato")
    .map((l) => ({ ...l, slaScadenza: null }));
  const fermi = fermiGrezzi.map((l) => ({ ...l, slaScadenza: null }));

  const m = primaRisposta?.m ?? null;
  const corpo: Oggi = {
    adesso: scegliAdesso({ nuovi, daFare, call: callOggi }, ora),
    nuovi, daFare, call: callOggi, proposte, fermi, finePausa,
    numeri: {
      leadNuovi: leadNuovi?.n ?? 0,
      primaRispostaMinuti: m == null ? null : Math.round(m),
      callSettimana: callSettimana?.n ?? 0,
      proposteAperte: proposteAperte?.n ?? 0,
    },
    // I fermi non entrano nel totale: sono a scomparsa.
    totale: nuovi.length + daFare.length + callOggi.length + proposte.length + finePausa.length,
  };
  return c.json(corpo);
});

todayRoutes.get("/stats", async (c) => {
  const { from, until } = statsSchema.parse(c.req.query());
  const db = c.env.DB;
  const range = "l.deleted_at IS NULL AND l.created_at BETWEEN ? AND ?";
  const [bySource, byCampaign, byStage, firstResponse] = await Promise.all([
    db.prepare(`SELECT l.source, COUNT(*) AS total, SUM(s.kind = 'won') AS won, SUM(s.kind = 'lost') AS lost ${FROM} WHERE ${range} GROUP BY l.source ORDER BY total DESC`).bind(from, until).all(),
    db.prepare(`SELECT COALESCE(l.meta_campaign, '(senza campagna)') AS campaign, COUNT(*) AS total, SUM(s.kind = 'won') AS won, SUM(s.kind = 'lost') AS lost ${FROM} WHERE ${range} AND l.source = 'meta' GROUP BY campaign ORDER BY total DESC`).bind(from, until).all(),
    db.prepare(`SELECT s.id AS stageId, s.label, COUNT(l.id) AS count FROM stages s LEFT JOIN leads l ON l.stage_id = s.id AND ${range} GROUP BY s.id ORDER BY s.sort_order`).bind(from, until).all(),
    db.prepare(
      `SELECT AVG(first_at - created_at) AS avgMs, COUNT(*) AS count FROM (
         SELECT l.created_at, (SELECT MIN(a.created_at) FROM activities a WHERE a.lead_id = l.id AND a.type IN ${HUMAN_TYPES}) AS first_at
         FROM leads l WHERE ${range}
       ) WHERE first_at IS NOT NULL`,
    ).bind(from, until).first<{ avgMs: number | null; count: number }>(),
  ]);
  return c.json({ bySource: bySource.results, byCampaign: byCampaign.results, byStage: byStage.results, firstResponse });
});
