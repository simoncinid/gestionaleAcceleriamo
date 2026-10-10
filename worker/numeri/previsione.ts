import { getDb } from "../db/client";
import { leggiImpostazioni } from "../impostazioni/service";

export type LeadAperto = { setupCents: number | null; feeCents: number | null; estimatedValue: number | null };
export type PropostaAperta = { option: "standard" | "proprieta"; setupCents: number | null; feeCents: number | null };

// Spec 6.9: la proposta aperta più recente vince sui valori del lead; la proprietà del codice è solo setup.
export function valoriLead(l: LeadAperto, p: PropostaAperta | null): { setupCents: number; feeCents: number } {
  if (p) return { setupCents: p.setupCents ?? 0, feeCents: p.option === "proprieta" ? 0 : p.feeCents ?? 0 };
  return { setupCents: l.setupCents ?? (l.estimatedValue != null ? l.estimatedValue * 100 : 0), feeCents: l.feeCents ?? 0 };
}

export type RigaFase = { stageId: string; label: string; probabilita: number; lead: number; setupCents: number; canoneCents: number; setupPesatoCents: number; canonePesatoCents: number };
// "Se chiudiamo tutto" (totali) e "Pesato per probabilità" (pesati), come nel prototipo 20.
export type Previsione = { lead: number; setupTotaleCents: number; canoneTotaleCents: number; setupPesatoCents: number; canonePesatoCents: number; ricorrenteCents: number; obiettivoCents: number; fasi: RigaFase[] };

export async function calcolaPrevisione(db: D1Database): Promise<Previsione> {
  const [imp, righe, ricorrente] = await Promise.all([
    leggiImpostazioni(getDb(db)),
    db.prepare(`SELECT s.id AS stageId, s.label, s.probability AS probabilita, s.sort_order AS ordine,
        l.setup_cents AS setupCents, l.fee_cents AS feeCents, l.estimated_value AS estimatedValue,
        p.option AS pOption, p.setup_cents AS pSetup, p.fee_cents AS pFee
      FROM leads l JOIN stages s ON s.id = l.stage_id
      LEFT JOIN proposals p ON p.id = (
        SELECT p2.id FROM proposals p2 WHERE p2.lead_id = l.id AND p2.status IN ('registrata', 'presentata') AND p2.deleted_at IS NULL
        ORDER BY p2.created_at DESC, p2.id DESC LIMIT 1)
      WHERE l.stage_id IN (SELECT id FROM stages WHERE kind = 'open') AND l.deleted_at IS NULL AND l.duplicate_of_id IS NULL`)
      .all<{ stageId: string; label: string; probabilita: number | null; ordine: number; setupCents: number | null; feeCents: number | null; estimatedValue: number | null; pOption: "standard" | "proprieta" | null; pSetup: number | null; pFee: number | null }>(),
    db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM fees WHERE status = 'attivo'").first<{ cents: number }>(),
  ]);
  const fasi = new Map<string, RigaFase & { ordine: number }>();
  for (const r of righe.results) {
    const v = valoriLead(r, r.pOption ? { option: r.pOption, setupCents: r.pSetup, feeCents: r.pFee } : null);
    const prob = (r.probabilita ?? 0) / 100;
    const f = fasi.get(r.stageId) ?? { stageId: r.stageId, label: r.label, probabilita: r.probabilita ?? 0, ordine: r.ordine, lead: 0, setupCents: 0, canoneCents: 0, setupPesatoCents: 0, canonePesatoCents: 0 };
    f.lead += 1;
    f.setupCents += v.setupCents;
    f.canoneCents += v.feeCents;
    f.setupPesatoCents += Math.round(v.setupCents * prob);
    f.canonePesatoCents += Math.round(v.feeCents * prob);
    fasi.set(r.stageId, f);
  }
  const elenco = [...fasi.values()].sort((a, b) => a.ordine - b.ordine).map(({ ordine: _o, ...f }) => f);
  return {
    lead: righe.results.length,
    setupTotaleCents: elenco.reduce((s, f) => s + f.setupCents, 0),
    canoneTotaleCents: elenco.reduce((s, f) => s + f.canoneCents, 0),
    setupPesatoCents: elenco.reduce((s, f) => s + f.setupPesatoCents, 0),
    canonePesatoCents: elenco.reduce((s, f) => s + f.canonePesatoCents, 0),
    ricorrenteCents: ricorrente?.cents ?? 0,
    obiettivoCents: imp.obiettivo.ricorrenteCents,
    fasi: elenco,
  };
}
