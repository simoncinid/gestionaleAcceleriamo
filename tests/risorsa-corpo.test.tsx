import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { analizzaCorpo, chiaveTitolo, firmaPassi, minutiLettura, passiSchema, pezziInline } from "../src/pagine/pubbliche/corpoRisorsa";
import { CorpoRisorsa } from "../src/pagine/pubbliche/Risorsa";

describe("markdown del corpo risorsa", () => {
  it("titoli, paragrafi su più righe, elenchi numerati e puntati", () => {
    const b = analizzaCorpo("## Prima\n\nRiga uno\nriga due.\n\n1. **Passo uno.** Descrizione.\n2. **Passo due:** Altra.\n\n- a;\n- b\n\n### Piccolo");
    expect(b.map((x) => x.tipo)).toEqual(["titolo", "paragrafo", "elenco", "elenco", "titolo"]);
    expect(b[0]).toMatchObject({ livello: 2, pezzi: [{ testo: "Prima", grassetto: false }] });
    expect(b[1]).toMatchObject({ pezzi: [{ testo: "Riga uno riga due.", grassetto: false }] });
    const ol = b[2] as Extract<(typeof b)[number], { tipo: "elenco" }>;
    expect(ol.ordinato).toBe(true);
    expect(ol.voci.map((v) => v.guida)).toEqual(["Passo uno", "Passo due"]);
    expect(ol.voci[0].resto).toEqual([{ testo: "Descrizione.", grassetto: false }]);
    expect((b[3] as any).ordinato).toBe(false);
    expect((b[4] as any).livello).toBe(3);
  });

  it("voci senza grassetto in testa restano un testo unico; numerazione e righe vuote tra le voci", () => {
    const [ol] = analizzaCorpo("3. Quale cosa fai?\n\n4. Quale **dato** ricopi?\ncontinua qui") as any[];
    expect(ol.inizio).toBe(3);
    expect(ol.voci).toHaveLength(2);
    expect(ol.voci[0].guida).toBeNull();
    expect(ol.voci[1].pezzi.map((p: any) => p.testo).join("")).toBe("Quale dato ricopi? continua qui");
  });

  it("un ** senza compagno e i caratteri speciali restano testo", () => {
    expect(pezziInline("2 ** 3 e **ok**")).toEqual([{ testo: "2 ** 3 e ", grassetto: false }, { testo: "ok", grassetto: true }]);
    expect(analizzaCorpo("#senza spazio")[0]).toMatchObject({ tipo: "paragrafo" });
  });

  it("nessun HTML interpretato: tag e attributi arrivano come testo", () => {
    const html = renderToStaticMarkup(<CorpoRisorsa testo={'## <img src=x onerror=alert(1)>\n\n<script>alert(1)</script> **<b>x</b>**\n\n1. **<i>t</i>.** [link](javascript:alert(1))'} />);
    expect(html).not.toMatch(/<script|<img|<b>|<i>|href=/);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("<strong>&lt;b&gt;x&lt;/b&gt;</strong>");
  });

  it("lo schema: numeri grandi, titolo del passo e descrizione; i sottotitoli con i due punti hanno la chiave in arancione", () => {
    const html = renderToStaticMarkup(<CorpoRisorsa testo={"## Lo schema: sei processi\n\n1. **Registrazione.** Ordini ricopiati.\n2. **Invio.** Richieste."} />);
    expect(html).toContain('class="risorsa-passi"');
    expect(html).toContain('<p class="risorsa-passo">Registrazione</p>');
    expect(html).toContain('<p class="risorsa-descrizione">Ordini ricopiati.</p>');
    expect(html).toContain('<span class="block text-accento">Lo schema:</span>sei processi');
  });

  it("parola chiave del titolo e minuti di lettura", () => {
    expect(chiaveTitolo("Come funziona: la PEC letta")).toEqual(["", "Come funziona:", " la PEC letta"]);
    expect(chiaveTitolo("Lo schema dei lavori")).toEqual(["Lo ", "schema", " dei lavori"]);
    expect(chiaveTitolo("Tre lavori fatti a mano, e come trovare il tuo")).toEqual(["Tre lavori fatti a mano, e ", "come trovare il tuo", ""]);
    expect(chiaveTitolo("Una guida")).toEqual(["Una guida", "", ""]);
    expect(minutiLettura("parola ".repeat(450))).toBe(2);
    expect(minutiLettura("")).toBe(1);
  });
});

describe("passi scritti come frase", () => {
  it("un titolo che finisce con la virgola perde la virgola e la descrizione riparte maiuscola", () => {
    const [ol] = analizzaCorpo("1. **Se conferma,** l'agenda si aggiorna da sola.") as any[];
    expect(ol.voci[0].guida).toBe("Se conferma");
    expect(ol.voci[0].resto[0].testo).toBe("L'agenda si aggiorna da sola.");
  });
});

describe("passi dello schema per il messaggio e le grafiche", () => {
  const corpo = "## Intro\n\n1. Domanda senza grassetto?\n2. Altra domanda?\n\n## Lo schema\n\n3. **Registrazione dei dati.** Ordini ricopiati a mano. Poi altro.\n4. **Invio,** le richieste partono.\n\nUn paragrafo in mezzo.\n\n1. **Secondo schema.** Non conta.";

  it("prende solo il primo elenco a passi, con il numero scritto, il titolo e la descrizione", () => {
    expect(passiSchema(corpo)).toEqual([
      { numero: 3, titolo: "Registrazione dei dati", descrizione: "Ordini ricopiati a mano. Poi altro." },
      { numero: 4, titolo: "Invio", descrizione: "Le richieste partono." },
    ]);
    expect(passiSchema("Solo testo.")).toEqual([]);
  });

  it("al massimo sette passi", () => {
    const lungo = Array.from({ length: 9 }, (_, i) => `${i + 1}. **Passo ${i + 1}.** Testo.`).join("\n");
    expect(passiSchema(lungo).map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("la firma cambia se cambiano i titoli o i numeri, non se cambia la descrizione", () => {
    const a = firmaPassi(passiSchema(corpo));
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(firmaPassi(passiSchema(corpo.replace("Ordini ricopiati", "Ordini scritti")))).toBe(a);
    expect(firmaPassi(passiSchema(corpo.replace("Invio,", "Spedizione,")))).not.toBe(a);
    expect(firmaPassi(passiSchema(corpo.replace("3. **Reg", "5. **Reg")))).not.toBe(a);
  });

  it("nella pagina i passi del primo schema hanno l'ancora passo-N, gli altri elenchi no", () => {
    const html = renderToStaticMarkup(<CorpoRisorsa testo={corpo} />);
    expect(html).toContain('<li id="passo-3">');
    expect(html).toContain('<li id="passo-4">');
    expect(html.match(/id="passo-/g)).toHaveLength(2);
  });
});
