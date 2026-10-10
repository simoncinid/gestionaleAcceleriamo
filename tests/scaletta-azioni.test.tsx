import { describe, expect, it } from "vitest";
import { BarraSelezione, FoglioSposta, guardiaInvio } from "../src/pagine/commerciale/AzioniScaletta";
import { CasellaSelezione } from "../src/pagine/commerciale/Scaletta";
import { contaPrimari, render } from "./render";

const UTENTI = [{ id: "tommaso", name: "Tommaso Rovini" }, { id: "diego", name: "Diego Simoncini" }];
const OPZIONI = [{ valore: "da-richiamare", etichetta: "Da richiamare" }, { valore: "in-pausa", etichetta: "In pausa" }];
const barra = (extra: object = {}) => render(<BarraSelezione n={3} utenti={UTENTI} inCorso={null} onAssegna={() => {}} onSposta={() => {}} onCestino={() => {}} {...extra} />);
const foglio = (extra: object = {}) => render(<FoglioSposta ids={["a", "b", "c"]} singolo={false} opzioni={OPZIONI} inCorso={false} onSposta={() => {}} onChiudi={() => {}} {...extra} />);

describe("Scaletta: conferme in blocco (fix dopo revisione 14b)", () => {
  it("senza responsabile scelto non c'è \"Assegna\"; scelto, \"Assegna 3 a Diego Simoncini\" e Annulla, niente primario", () => {
    expect(barra()).not.toContain("Assegna");
    const html = barra({ responsabileIniziale: "diego" });
    expect(html).toContain("Assegna 3 a Diego Simoncini");
    expect(html).toContain(">Annulla<");
    expect(contaPrimari(html)).toBe(0);
  });
  it("cestino: al primo tocco secondario, al secondo distruttivo con il numero", () => {
    const prima = barra();
    expect(prima).toContain("Metti nel cestino");
    expect(prima).not.toContain('data-variante="distruttivo"');
    const dopo = barra({ chiedeCestinoIniziale: true });
    expect(dopo).toContain("Tocca di nuovo: 3 nel cestino");
    expect(dopo).toContain('data-variante="distruttivo"');
  });
  it("foglio Sposta in blocco: si apre senza fase, primario spento; con la fase \"Sposta in In pausa\"", () => {
    const vuoto = foglio();
    expect(vuoto).toContain("Sposta 3 lead");
    expect(contaPrimari(vuoto)).toBe(1);
    expect(vuoto).toMatch(/data-variante="primario"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*data-variante="primario"/);
    const scelto = foglio({ faseIniziale: "in-pausa" });
    expect(scelto).toContain("Sposta in In pausa");
    expect(scelto).not.toMatch(/data-variante="primario"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*data-variante="primario"/);
  });
  it("un lead solo dal menu rapido: nessun primario, la fase parte vuota anche se ne arriva una", () => {
    const html = render(<FoglioSposta ids={["a"]} singolo opzioni={OPZIONI} inCorso={false} onSposta={() => {}} onChiudi={() => {}} faseIniziale="in-pausa" />);
    expect(html).toContain("Sposta in fase");
    expect(contaPrimari(html)).toBe(0);
    expect(html).not.toContain("Sposta in In pausa");
  });
  it("un invio alla volta: il secondo tocco non parte finché il primo non è finito", () => {
    const g = guardiaInvio();
    let inviati = 0;
    expect(g.prova(() => inviati++)).toBe(true);
    expect(g.prova(() => inviati++)).toBe(false);
    expect(inviati).toBe(1);
    g.libera();
    expect(g.prova(() => inviati++)).toBe(true);
    expect(inviati).toBe(2);
  });
});

describe("Scaletta: caselle di selezione", () => {
  it("area di tocco da 44 px intorno alla casella da 20 px, colore del DS", () => {
    const html = render(<table><tbody><tr><td><CasellaSelezione etichetta="Seleziona Officina" scelta={false} onCambia={() => {}} /></td></tr></tbody></table>);
    expect(html).toMatch(/<label[^>]*class="[^"]*min-h-11[^"]*min-w-11/);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("size-5");
    expect(html).toContain("accent-ink");
    expect(html).toContain('aria-label="Seleziona Officina"');
  });
});
