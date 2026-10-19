import { describe, expect, it } from "vitest";
import esempioJson from "../scripts/risponditore-semina.esempio.json";
import { sqlSemina, validaSemina } from "../scripts/lib/risponditore-semina";

const esempio = () => structuredClone(esempioJson) as any;

describe("semina del risponditore", () => {
  it("accetta il file di esempio e normalizza la parola", () => {
    const s = validaSemina(esempio());
    expect(s.risorse.map((r) => r.slug)).toEqual(["tempo", "manutenzione"]);
    expect(s.campagne.map((c) => c.parola)).toEqual(["tempo", "manutenzione"]);
    expect(s.avvisi).toEqual([]);
  });

  it("rifiuta slug sbagliato, pdf non http e parola doppia dopo normalizza", () => {
    const j = esempio();
    j.risorse[0].slug = "Tempo Libero";
    j.risorse[1].pdfUrl = "javascript:alert(1)";
    j.campagne[1].parola = "Tèmpo!";
    expect(() => validaSemina(j)).toThrow(/slug[\s\S]*pdfUrl[\s\S]*compare due volte/);
  });

  it("la stessa parola su post diversi è permessa", () => {
    const j = esempio();
    j.campagne[1].parola = "tempo";
    j.campagne[1].mediaId = "123";
    expect(() => validaSemina(j)).not.toThrow();
  });

  it("l'SQL è rilanciabile: upsert delle risorse, insert condizionato più update delle campagne, apici raddoppiati", () => {
    const j = esempio();
    j.risorse[0].titolo = "L'ora giusta";
    const sql = sqlSemina(validaSemina(j), 1000, () => "id-fisso").join("\n");
    expect(sql).toContain("ON CONFLICT(slug) DO UPDATE");
    expect(sql).toContain("'L''ora giusta'");
    expect(sql).toContain("WHERE NOT EXISTS (SELECT 1 FROM risp_campagne WHERE parola = 'tempo' AND media_id IS NULL)");
    expect(sql).toMatch(/UPDATE risp_campagne SET [\s\S]*WHERE parola = 'tempo' AND media_id IS NULL;/);
    expect(sql).toContain('\'["Risposta pubblica di prova 1","Risposta pubblica di prova 2"]\'');
  });
});
