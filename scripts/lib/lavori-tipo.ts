// I tre lavori tipo di Acceleriamo (spec 22/10/2026, sezione 2) e l'SQL che li crea o li aggiorna, senza toccare il database.
// Lo usa scripts/lavori-tipo.ts. Id fissi: rilanciare aggiorna nomi, passi e giorni, non duplica.
// Tabelle: job_templates e job_template_tasks (worker/db/schema.ts). Il lavoro tipo "Automazione su misura" non si tocca.

type Passo = { titolo: string; chi: "diego" | "tommaso"; giorni?: number; giornoDelMese?: number };
export type LavoroTipo = { id: string; nome: string; tipo: "una_tantum" | "una_tantum_ricorrente" | "ricorrente"; passi: Passo[] };

// Una tantum: entro N giorni dall'avvio. Diego consulenza e sviluppo, Tommaso il documento commerciale.
const UNA_TANTUM: Passo[] = [
  { titolo: "Analisi dei processi", chi: "diego", giorni: 3 },
  { titolo: "Documento di analisi e preventivo firmato", chi: "tommaso", giorni: 7 },
  { titolo: "Sviluppo", chi: "diego", giorni: 21 },
  { titolo: "Collaudo con il cliente", chi: "diego", giorni: 25 },
  { titolo: "Consegna e formazione", chi: "diego", giorni: 28 },
  { titolo: "Fattura del saldo", chi: "diego", giorni: 30 },
];
// Mensile: giorno del mese. La fattura il 1 (regola operativa del 05/06/2026).
const MENSILE: Passo[] = [
  { titolo: "Fattura del canone", chi: "diego", giornoDelMese: 1 },
  { titolo: "Controllo che le automazioni girino", chi: "diego", giornoDelMese: 5 },
  { titolo: "Piccole ottimizzazioni e aggiornamenti", chi: "diego", giornoDelMese: 15 },
  { titolo: "Resoconto al cliente", chi: "tommaso", giornoDelMese: 28 },
];

export const LAVORI_TIPO: LavoroTipo[] = [
  { id: "lt-una-tantum", nome: "Una tantum", tipo: "una_tantum", passi: UNA_TANTUM },
  { id: "lt-mensile", nome: "Mensile", tipo: "ricorrente", passi: MENSILE },
  { id: "lt-mensile-una-tantum", nome: "Mensile più una tantum", tipo: "una_tantum_ricorrente", passi: [...UNA_TANTUM, ...MENSILE] },
];

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function sqlLavoriTipo(now: number, lavori = LAVORI_TIPO): string[] {
  const righe: string[] = [];
  for (const l of lavori) {
    righe.push(`INSERT INTO job_templates (id, name, kind, created_at) VALUES (${q(l.id)}, ${q(l.nome)}, ${q(l.tipo)}, ${now}) ON CONFLICT (id) DO UPDATE SET name = excluded.name, kind = excluded.kind, deleted_at = NULL;`);
    const ids = l.passi.map((_, i) => `${l.id}-${i + 1}`);
    l.passi.forEach((p, i) => {
      const ricorrente = p.giornoDelMese != null;
      righe.push(`INSERT INTO job_template_tasks (id, template_id, title, recurrence, assignee_id, due_days, month_day, position) VALUES (${q(ids[i])}, ${q(l.id)}, ${q(p.titolo)}, ${ricorrente ? "'ricorrente'" : "'una_tantum'"}, (SELECT id FROM users WHERE username = ${q(p.chi)}), ${ricorrente ? "NULL" : p.giorni}, ${ricorrente ? p.giornoDelMese : "NULL"}, ${i + 1}) ON CONFLICT (id) DO UPDATE SET title = excluded.title, recurrence = excluded.recurrence, assignee_id = excluded.assignee_id, due_days = excluded.due_days, month_day = excluded.month_day, position = excluded.position;`);
    });
    // Un passo tolto dall'elenco sparisce dal lavoro tipo (le task già create nei lavori restano).
    righe.push(`DELETE FROM job_template_tasks WHERE template_id = ${q(l.id)} AND id NOT IN (${ids.map(q).join(", ")});`);
  }
  return righe;
}
