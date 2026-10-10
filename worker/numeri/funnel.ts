import { getDb } from "../db/client";
import { leggiImpostazioni } from "../impostazioni/service";
import { leggiSla, scadenzaPrimaChiamata } from "../regole/sla";

export const SOGLIA_MINIMA = 5;
export const percentualeOnesta = (parte: number, totale: number) => (totale < SOGLIA_MINIMA ? null : Math.round((parte / totale) * 100));

// Prima risposta umana, come nella 1A (worker/today/routes.ts).
export const TIPI_UMANI = "('nota','chiamata','email','cambio_fase')";
const FROM = "FROM leads l JOIN stages s ON s.id = l.stage_id";

export type Stats1A = {
  bySource: { source: string; total: number; won: number; lost: number }[];
  byCampaign: { campaign: string; total: number; won: number; lost: number }[];
  byStage: { stageId: string; label: string; count: number }[];
  firstResponse: { avgMs: number | null; count: number } | null;
};

// Il corpo della rotta /stats della 1A, spostato qui senza cambiare una riga di SQL.
export async function statsDella1A(db: D1Database, from: number, until: number): Promise<Stats1A> {
  const range = "l.deleted_at IS NULL AND l.created_at BETWEEN ? AND ?";
  const [bySource, byCampaign, byStage, firstResponse] = await Promise.all([
    db.prepare(`SELECT l.source, COUNT(*) AS total, SUM(s.kind = 'won') AS won, SUM(s.kind = 'lost') AS lost ${FROM} WHERE ${range} GROUP BY l.source ORDER BY total DESC`).bind(from, until).all<Stats1A["bySource"][number]>(),
    db.prepare(`SELECT COALESCE(l.meta_campaign, '(senza campagna)') AS campaign, COUNT(*) AS total, SUM(s.kind = 'won') AS won, SUM(s.kind = 'lost') AS lost ${FROM} WHERE ${range} AND l.source = 'meta' GROUP BY campaign ORDER BY total DESC`).bind(from, until).all<Stats1A["byCampaign"][number]>(),
    db.prepare(`SELECT s.id AS stageId, s.label, COUNT(l.id) AS count FROM stages s LEFT JOIN leads l ON l.stage_id = s.id AND ${range} GROUP BY s.id ORDER BY s.sort_order`).bind(from, until).all<Stats1A["byStage"][number]>(),
    db.prepare(
      `SELECT AVG(first_at - created_at) AS avgMs, COUNT(*) AS count FROM (
         SELECT l.created_at, (SELECT MIN(a.created_at) FROM activities a WHERE a.lead_id = l.id AND a.type IN ${TIPI_UMANI}) AS first_at
         FROM leads l WHERE ${range}
       ) WHERE first_at IS NOT NULL`,
    ).bind(from, until).first<{ avgMs: number | null; count: number }>(),
  ]);
  return { bySource: bySource.results, byCampaign: byCampaign.results, byStage: byStage.results, firstResponse };
}

export type TempoFase = { stageId: string; label: string; giorniMedi: number; passaggi: number };

const RE_CAMBIO = /^Da "(.*)" a "(.*)"$/;

// Il cambio di fase della 1A scrive le etichette ("Da "X" a "Y""): il tempo in una fase è
// la distanza tra il passaggio che ci entra e quello che ne esce. Le permanenze ancora aperte non contano.
export function tempiPerFase(eventi: { leadId: string; at: number; body: string }[], fasi: { id: string; label: string }[]): TempoFase[] {
  const perLead = new Map<string, { at: number; a: string }[]>();
  for (const e of eventi) {
    const m = RE_CAMBIO.exec(e.body);
    if (!m) continue;
    const lista = perLead.get(e.leadId) ?? [];
    lista.push({ at: e.at, a: m[2] });
    perLead.set(e.leadId, lista);
  }
  const somme = new Map<string, { totale: number; n: number }>();
  for (const lista of perLead.values()) {
    lista.sort((x, y) => x.at - y.at);
    for (let i = 1; i < lista.length; i++) {
      const s = somme.get(lista[i - 1].a) ?? { totale: 0, n: 0 };
      s.totale += lista[i].at - lista[i - 1].at;
      s.n += 1;
      somme.set(lista[i - 1].a, s);
    }
  }
  return fasi.filter((f) => somme.has(f.label)).map((f) => {
    const s = somme.get(f.label)!;
    return { stageId: f.id, label: f.label, giorniMedi: Math.round((s.totale / s.n / 86_400_000) * 10) / 10, passaggi: s.n };
  });
}

export type Tappa = { chiave: "arrivati" | "sla" | "conoscenza" | "presentazione" | "proposte" | "chiusi"; nome: string; numero: number; percentuale: number | null };
export type Funnel = Stats1A & {
  tappe: Tappa[];
  sla: { percentuale: number | null; dentro: number; totale: number };
  tempi: TempoFase[];
  motivi: { id: string; etichetta: string; numero: number }[];
  call: { conoscenza: number; presentazione: number; rapporto: number | null };
};

export async function calcolaFunnel(db: D1Database, from: number, until: number): Promise<Funnel> {
  const coorte = "l.deleted_at IS NULL AND l.duplicate_of_id IS NULL AND l.created_at BETWEEN ?1 AND ?2";
  const [stats, sla, imp, righe, eventi, fasi, motivi] = await Promise.all([
    statsDella1A(db, from, until),
    leggiSla(getDb(db)),
    leggiImpostazioni(getDb(db)),
    db.prepare(`SELECT l.id, l.source, l.created_at AS createdAt, s.kind,
        (SELECT MIN(a.created_at) FROM activities a WHERE a.lead_id = l.id AND a.type IN ${TIPI_UMANI}) AS primaRisposta,
        EXISTS (SELECT 1 FROM calls c WHERE c.lead_id = l.id AND c.kind = 'conoscenza' AND c.outcome = 'fatta' AND c.deleted_at IS NULL) AS conoscenza,
        EXISTS (SELECT 1 FROM calls c WHERE c.lead_id = l.id AND c.kind = 'presentazione' AND c.outcome = 'fatta' AND c.deleted_at IS NULL) AS presentazione,
        EXISTS (SELECT 1 FROM proposals p WHERE p.lead_id = l.id AND p.presented_at IS NOT NULL AND p.deleted_at IS NULL) AS proposta
      ${FROM} WHERE ${coorte}`).bind(from, until).all<{ id: string; source: string; createdAt: number; kind: string; primaRisposta: number | null; conoscenza: number; presentazione: number; proposta: number }>(),
    // Cambi di fase dei lead della coorte: passa dall'indice dei lead per data e da quello delle attività per lead,
    // senza scorrere tutto il registro delle attività.
    db.prepare(`SELECT a.lead_id AS leadId, a.created_at AS at, a.body FROM leads l JOIN activities a ON a.lead_id = l.id
      WHERE ${coorte} AND a.type = 'cambio_fase'`).bind(from, until).all<{ leadId: string; at: number; body: string }>(),
    db.prepare("SELECT id, label FROM stages ORDER BY sort_order").all<{ id: string; label: string }>(),
    db.prepare(`SELECT l.lost_reason AS id, COUNT(*) AS numero ${FROM} WHERE ${coorte} AND s.kind = 'lost' AND l.lost_reason IS NOT NULL GROUP BY l.lost_reason ORDER BY numero DESC`).bind(from, until).all<{ id: string; numero: number }>(),
  ]);
  const r = righe.results;
  // Lo SLA vale per i lead arrivati da soli (Meta e foglio), non per quelli inseriti a mano.
  const conSla = r.filter((x) => x.source !== "manuale");
  const dentro = conSla.filter((x) => x.primaRisposta != null && x.primaRisposta <= scadenzaPrimaChiamata(x.createdAt, sla)).length;
  const conta = (f: (x: (typeof r)[number]) => boolean) => r.filter(f).length;
  const arrivati = r.length;
  const tappa = (chiave: Tappa["chiave"], nome: string, numero: number, su = arrivati): Tappa => ({ chiave, nome, numero, percentuale: percentualeOnesta(numero, su) });
  const conoscenza = conta((x) => !!x.conoscenza);
  const presentazione = conta((x) => !!x.presentazione);
  const etichette = new Map(imp.motivi.map((m) => [m.id, m.etichetta]));
  return {
    ...stats,
    tappe: [
      tappa("arrivati", "Lead arrivati", arrivati),
      tappa("sla", "Chiamati entro lo SLA", dentro, conSla.length),
      tappa("conoscenza", "Call di conoscenza fatte", conoscenza),
      tappa("presentazione", "Call di presentazione fatte", presentazione),
      tappa("proposte", "Proposte presentate", conta((x) => !!x.proposta)),
      tappa("chiusi", "Clienti chiusi", conta((x) => x.kind === "won")),
    ],
    sla: { percentuale: percentualeOnesta(dentro, conSla.length), dentro, totale: conSla.length },
    tempi: tempiPerFase(eventi.results, fasi.results),
    motivi: motivi.results.map((m) => ({ id: m.id, etichetta: etichette.get(m.id) ?? m.id, numero: m.numero })),
    call: { conoscenza, presentazione, rapporto: percentualeOnesta(presentazione, conoscenza) },
  };
}
