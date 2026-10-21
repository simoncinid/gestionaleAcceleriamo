import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { LAVORI_TIPO, sqlLavoriTipo } from "../scripts/lib/lavori-tipo";
import { createUser } from "./helpers";

const applica = async (righe: string[]) => { for (const r of righe) await env.DB.prepare(r).run(); };
const passi = (id: string) => env.DB.prepare("SELECT title, recurrence, assignee_id AS chi, due_days AS giorni, month_day AS giorno FROM job_template_tasks WHERE template_id = ? ORDER BY position")
  .bind(id).all<{ title: string; recurrence: string; chi: string | null; giorni: number | null; giorno: number | null }>().then((r) => r.results);

describe("lavori tipo", () => {
  it("crea i tre lavori tipo con passi, giorni e assegnatari; rilanciato aggiorna senza duplicare", async () => {
    await createUser("diego", "password-lunga-1", "Diego");
    await createUser("tommaso");
    await applica(sqlLavoriTipo(1000));
    await env.DB.prepare("UPDATE job_template_tasks SET title = 'Vecchio' WHERE id = 'lt-mensile-1'").run();
    await env.DB.prepare("INSERT INTO job_template_tasks (id, template_id, title, recurrence, position) VALUES ('lt-mensile-9', 'lt-mensile', 'Tolto', 'ricorrente', 9)").run();
    await applica(sqlLavoriTipo(2000));

    const tipi = await env.DB.prepare("SELECT id, name, kind FROM job_templates WHERE id LIKE 'lt-%' AND id != 'lt-automazione-su-misura' ORDER BY id").all();
    expect(tipi.results).toEqual([
      { id: "lt-mensile", name: "Mensile", kind: "ricorrente" },
      { id: "lt-mensile-una-tantum", name: "Mensile più una tantum", kind: "una_tantum_ricorrente" },
      { id: "lt-una-tantum", name: "Una tantum", kind: "una_tantum" },
    ]);
    const una = await passi("lt-una-tantum");
    expect(una.map((p) => [p.title, p.giorni, p.chi])).toEqual([
      ["Analisi dei processi", 3, "diego"], ["Documento di analisi e preventivo firmato", 7, "tommaso"], ["Sviluppo", 21, "diego"],
      ["Collaudo con il cliente", 25, "diego"], ["Consegna e formazione", 28, "diego"], ["Fattura del saldo", 30, "diego"],
    ]);
    const mensile = await passi("lt-mensile");
    expect(mensile.map((p) => [p.title, p.giorno, p.chi, p.recurrence])).toEqual([
      ["Fattura del canone", 1, "diego", "ricorrente"], ["Controllo che le automazioni girino", 5, "diego", "ricorrente"],
      ["Piccole ottimizzazioni e aggiornamenti", 15, "diego", "ricorrente"], ["Resoconto al cliente", 28, "tommaso", "ricorrente"],
    ]);
    expect((await passi("lt-mensile-una-tantum")).length).toBe(10);
    expect(LAVORI_TIPO).toHaveLength(3);
  });

  it("raddoppia gli apici nei testi", () => {
    const sql = sqlLavoriTipo(1, [{ id: "x", nome: "L'una", tipo: "una_tantum", passi: [{ titolo: "Dell'analisi", chi: "diego", giorni: 1 }] }]).join("\n");
    expect(sql).toContain("'L''una'");
    expect(sql).toContain("'Dell''analisi'");
  });
});
