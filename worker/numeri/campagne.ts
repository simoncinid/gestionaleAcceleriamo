import { getDb } from "../db/client";
import { leggiImpostazioni } from "../impostazioni/service";
import { daRoma } from "../lib/roma";

export type LivelloCosto = "senza_spesa" | "buono" | "accettabile" | "attenzione" | "stop";

// Spec 6.9: soglie 8, 13, 16 euro per lead; oltre 16 la riga "Stop loss superato".
export function livelloCosto(costoCents: number | null, [verde, giallo, rosso]: [number, number, number]): LivelloCosto {
  if (costoCents == null) return "senza_spesa";
  if (costoCents <= verde) return "buono";
  if (costoCents <= giallo) return "accettabile";
  if (costoCents <= rosso) return "attenzione";
  return "stop";
}

type Conteggi = { lead: number; qualificati: number; call: number; proposte: number; vinti: number; setupVintoCents: number };
export type RigaInserzione = Conteggi & { inserzione: string };
export type RigaCampagna = Conteggi & {
  campagna: string;
  spesaCents: number | null;
  costoPerLeadCents: number | null;
  costoPerClienteCents: number | null;
  livello: LivelloCosto;
  inserzioni: RigaInserzione[];
};
export type Campagne = { mese: string; soglieCents: [number, number, number]; campagne: RigaCampagna[] };

export function confiniMese(mese: string): [number, number] {
  const [a, m] = mese.split("-").map(Number);
  return [daRoma(a, m, 1), (m === 12 ? daRoma(a + 1, 1, 1) : daRoma(a, m + 1, 1)) - 1];
}

const vuoto = (): Conteggi => ({ lead: 0, qualificati: 0, call: 0, proposte: 0, vinti: 0, setupVintoCents: 0 });

export async function calcolaCampagne(db: D1Database, mese: string): Promise<Campagne> {
  const [da, a] = confiniMese(mese);
  const [imp, righe, spese] = await Promise.all([
    leggiImpostazioni(getDb(db)),
    // Lead del mese con una campagna, da webhook e foglio, senza doppioni.
    db.prepare(`SELECT l.meta_campaign AS campagna, COALESCE(l.meta_ad, '(senza inserzione)') AS inserzione, s.kind,
        COALESCE(l.setup_cents, l.estimated_value * 100, 0) AS setupCents,
        EXISTS (SELECT 1 FROM calls c WHERE c.lead_id = l.id AND c.kind = 'conoscenza' AND c.outcome = 'fatta' AND c.deleted_at IS NULL) AS qualificato,
        (SELECT COUNT(*) FROM calls c WHERE c.lead_id = l.id AND c.outcome = 'fatta' AND c.deleted_at IS NULL) AS call,
        EXISTS (SELECT 1 FROM proposals p WHERE p.lead_id = l.id AND p.status <> 'bozza' AND p.deleted_at IS NULL) AS proposta
      FROM leads l JOIN stages s ON s.id = l.stage_id
      WHERE l.deleted_at IS NULL AND l.duplicate_of_id IS NULL AND l.meta_campaign IS NOT NULL AND l.created_at BETWEEN ?1 AND ?2`).bind(da, a)
      .all<{ campagna: string; inserzione: string; kind: string; setupCents: number; qualificato: number; call: number; proposta: number }>(),
    db.prepare("SELECT campagna, amount_cents AS cents FROM campaign_spend WHERE mese = ?1").bind(mese).all<{ campagna: string; cents: number }>(),
  ]);
  const soglie = imp.campagne.soglieCents as [number, number, number];
  const somma = (c: Conteggi, r: (typeof righe.results)[number]) => {
    c.lead += 1;
    c.qualificati += r.qualificato ? 1 : 0;
    c.call += r.call;
    c.proposte += r.proposta ? 1 : 0;
    if (r.kind === "won") { c.vinti += 1; c.setupVintoCents += r.setupCents; }
  };
  const perCampagna = new Map<string, { tot: Conteggi; ins: Map<string, Conteggi> }>();
  for (const r of righe.results) {
    const g = perCampagna.get(r.campagna) ?? { tot: vuoto(), ins: new Map() };
    somma(g.tot, r);
    const i = g.ins.get(r.inserzione) ?? vuoto();
    somma(i, r);
    g.ins.set(r.inserzione, i);
    perCampagna.set(r.campagna, g);
  }
  // Una campagna con la spesa ma senza lead nel mese resta visibile: è il caso peggiore.
  for (const s of spese.results) if (!perCampagna.has(s.campagna)) perCampagna.set(s.campagna, { tot: vuoto(), ins: new Map() });
  const spesa = new Map(spese.results.map((s) => [s.campagna, s.cents]));
  const campagne = [...perCampagna.entries()].map(([campagna, g]): RigaCampagna => {
    const spesaCents = spesa.get(campagna) ?? null;
    // Spesa zero: niente costo per lead (non è un "€ 0,00" col punto verde) e livello senza_spesa;
    // la schermata distingue "nessuna spesa" (spesaCents 0) da "spesa da scrivere" (null).
    const conSpesa = spesaCents != null && spesaCents > 0 ? spesaCents : null;
    const costoPerLeadCents = conSpesa == null ? null : g.tot.lead === 0 ? conSpesa : Math.round(conSpesa / g.tot.lead);
    return {
      campagna, ...g.tot, spesaCents, costoPerLeadCents,
      costoPerClienteCents: conSpesa == null || g.tot.vinti === 0 ? null : Math.round(conSpesa / g.tot.vinti),
      livello: livelloCosto(costoPerLeadCents, soglie),
      inserzioni: [...g.ins.entries()].map(([inserzione, c]) => ({ inserzione, ...c })).sort((x, y) => y.lead - x.lead),
    };
  }).sort((x, y) => y.lead - x.lead || x.campagna.localeCompare(y.campagna));
  return { mese, soglieCents: soglie, campagne };
}
