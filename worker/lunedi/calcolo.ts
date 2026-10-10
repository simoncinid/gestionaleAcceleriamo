import { getDb } from "../db/client";
import { leggiImpostazioni } from "../impostazioni/service";
import { daRoma, meseRoma, partiRoma } from "../lib/roma";
import { confiniMese } from "../numeri/campagne";

const GIORNO = 86_400_000;

export function lunediDi(ms: number): { chiave: string; inizio: number } {
  const p = partiRoma(ms);
  const indietro = (p.settimana + 6) % 7; // 0 = lunedì
  const d = new Date(Date.UTC(p.anno, p.mese - 1, p.giorno - indietro));
  return { chiave: d.toISOString().slice(0, 10), inizio: daRoma(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0) };
}

export type NumeriSettimana = {
  da: number;
  a: number;
  arrivati: number;
  perFonte: { source: string; n: number }[];
  costoPerLeadCents: number | null;
  conoscenza: number;
  presentazione: number;
  proposte: number;
  vinti: number;
  fermi: { id: string; company: string; giorni: number }[];
  proposteFerme: { id: string; leadId: string | null; company: string; giorni: number }[];
  ricorrenteCents: number;
  obiettivoCents: number;
  spesaAdsMeseCents: number;
};

// Spec 6.4: la settimana appena chiusa, calcolata senza Claude. Undici query.
export async function calcolaSettimana(db: D1Database, now: number): Promise<NumeriSettimana> {
  const a = lunediDi(now).inizio;
  const da = lunediDi(a - 3_600_000).inizio;
  const mese = meseRoma(now);
  const [inizioMese, fineMese] = confiniMese(mese);
  const lead = "deleted_at IS NULL AND duplicate_of_id IS NULL";
  const [imp, fonti, call, proposte, vinti, regola, ricorrente, spesa, leadMese] = await Promise.all([
    leggiImpostazioni(getDb(db)),
    db.prepare(`SELECT source, COUNT(*) AS n FROM leads WHERE ${lead} AND created_at >= ?1 AND created_at < ?2 GROUP BY source ORDER BY n DESC`).bind(da, a).all<{ source: string; n: number }>(),
    db.prepare("SELECT kind, COUNT(*) AS n FROM calls WHERE deleted_at IS NULL AND outcome = 'fatta' AND scheduled_at >= ?1 AND scheduled_at < ?2 GROUP BY kind").bind(da, a).all<{ kind: string; n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM proposals WHERE deleted_at IS NULL AND status <> 'bozza' AND created_at >= ?1 AND created_at < ?2").bind(da, a).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM leads l JOIN stages s ON s.id = l.stage_id WHERE l.deleted_at IS NULL AND s.kind = 'won' AND l.stage_changed_at >= ?1 AND l.stage_changed_at < ?2").bind(da, a).first<{ n: number }>(),
    db.prepare("SELECT params FROM stage_rules WHERE rule_key = 'fermo' AND active = 1").first<{ params: string }>(),
    db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM fees WHERE status = 'attivo'").first<{ cents: number }>(),
    db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM campaign_spend WHERE mese = ?1").bind(mese).first<{ cents: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE ${lead} AND meta_campaign IS NOT NULL AND created_at BETWEEN ?1 AND ?2`).bind(inizioMese, fineMese).first<{ n: number }>(),
  ]);
  const giorniFermo = Number((JSON.parse(regola?.params ?? "{}") as { giorni?: number }).giorni ?? 7);
  // Stessi criteri del gruppo "Fermi" di Oggi (worker/today/routes.ts).
  const [fermi, proposteFerme] = await Promise.all([
    db.prepare(`SELECT l.id, l.company, l.stage_changed_at AS da FROM leads l JOIN stages s ON s.id = l.stage_id
      WHERE l.deleted_at IS NULL AND s.kind = 'open' AND l.stage_id NOT IN ('probabilmente-bloccato', 'da-chiamare-prima-volta')
        AND l.stage_changed_at <= ?1 ORDER BY l.stage_changed_at LIMIT 20`).bind(now - giorniFermo * GIORNO).all<{ id: string; company: string; da: number }>(),
    db.prepare(`SELECT p.id, p.lead_id AS leadId, COALESCE(l.company, p.company) AS company, COALESCE(p.presented_at, p.sent_at, p.created_at) AS da
      FROM proposals p LEFT JOIN leads l ON l.id = p.lead_id
      WHERE p.deleted_at IS NULL AND p.status IN ('registrata', 'presentata') AND COALESCE(p.presented_at, p.sent_at, p.created_at) <= ?1
      ORDER BY da LIMIT 20`).bind(now - 14 * GIORNO).all<{ id: string; leadId: string | null; company: string; da: number }>(),
  ]);
  const giorni = (x: number) => Math.floor((now - x) / GIORNO);
  const spesaCents = spesa?.cents ?? 0;
  return {
    da, a,
    arrivati: fonti.results.reduce((s, f) => s + f.n, 0),
    perFonte: fonti.results,
    costoPerLeadCents: spesaCents === 0 || !leadMese?.n ? null : Math.round(spesaCents / leadMese.n),
    conoscenza: call.results.find((c) => c.kind === "conoscenza")?.n ?? 0,
    presentazione: call.results.find((c) => c.kind === "presentazione")?.n ?? 0,
    proposte: proposte?.n ?? 0,
    vinti: vinti?.n ?? 0,
    fermi: fermi.results.map((f) => ({ id: f.id, company: f.company, giorni: giorni(f.da) })),
    proposteFerme: proposteFerme.results.map((p) => ({ id: p.id, leadId: p.leadId, company: p.company, giorni: giorni(p.da) })),
    ricorrenteCents: ricorrente?.cents ?? 0,
    obiettivoCents: imp.obiettivo.ricorrenteCents,
    spesaAdsMeseCents: spesaCents,
  };
}

// Crea la revisione della settimana chiusa se non c'è: dal giro delle 7 o alla prima apertura.
export async function revisioneCorrente(db: D1Database, now: number): Promise<{ id: string; nuova: boolean }> {
  const settimana = lunediDi(lunediDi(now).inizio - 3_600_000).chiave;
  const c = await db.prepare("SELECT id FROM weekly_reviews WHERE settimana = ?1").bind(settimana).first<{ id: string }>();
  if (c) return { id: c.id, nuova: false };
  const numeri = await calcolaSettimana(db, now);
  const id = crypto.randomUUID();
  // ON CONFLICT: se giro e apertura arrivano insieme, vince la prima riga.
  await db.prepare("INSERT INTO weekly_reviews (id, settimana, numeri, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT (settimana) DO NOTHING").bind(id, settimana, JSON.stringify(numeri), now).run();
  const r = await db.prepare("SELECT id FROM weekly_reviews WHERE settimana = ?1").bind(settimana).first<{ id: string }>();
  return { id: r!.id, nuova: r!.id === id };
}
