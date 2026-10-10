import { describe, expect, it } from "vitest";
import { markdownSicuro } from "../worker/lib/markdown";

describe("markdownSicuro", () => {
  it("titoli, elenchi, grassetto e link http", () => {
    expect(markdownSicuro("## Chi è\n- uno\n- **due**\n\n[sito](https://a.it)")).toBe(
      '<h2>Chi è</h2>\n<ul><li>uno</li><li><strong>due</strong></li></ul>\n<p><a href="https://a.it" rel="noopener noreferrer">sito</a></p>',
    );
  });
  it("niente HTML passa", () => {
    expect(markdownSicuro("<img src=x onerror=alert(1)>")).toBe("<p>&lt;img src=x onerror=alert(1)&gt;</p>");
  });
  it("link non http restano testo", () => {
    expect(markdownSicuro("[x](javascript:alert(1))")).toBe("<p>x</p>");
  });
  it("un link con le virgolette non esce dall'attributo", () => {
    expect(markdownSicuro('[x](https://a.it/"onmouseover=alert(1))')).not.toContain('"onmouseover');
  });
  it("paragrafo dopo un elenco e titoli oltre il quarto livello", () => {
    expect(markdownSicuro("- a\ntesto\n# Uno")).toBe("<ul><li>a</li></ul>\n<p>testo</p>\n<h2>Uno</h2>");
  });
});
