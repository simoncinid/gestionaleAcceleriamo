import { describe, expect, it } from "vitest";
import { Oggi, titoloOggi } from "../src/pagine/commerciale/Oggi";
import { aperturaDi } from "../src/pagine/commerciale/RigaOggi";
import { BadgeIntero } from "../src/guscio/BadgeIntero";
import type { Oggi as DatiOggi, RigaOggi } from "../src/types";
import { FASI, GIORNO, ORA, ORE, riga } from "./b1c-fixture";
import { contaPrimari, render } from "./render";

const r = (id: string, scadenza: number, stato: "scaduto" | "oggi", testo = "Chiama Luca"): RigaOggi => {
  const l = riga(id, { scadenza, stato });
  return { id: l.id, company: l.company, contactName: l.contactName, phone: l.phone, email: l.email, stageId: l.stageId, ownerId: l.ownerId,
    attemptCount: l.attemptCount, setupCents: null, feeCents: null, meetLink: null, prossima: { ...l.prossima!, pulsante: { testo, codice: "chiama" } } };
};
const DATI: DatiOggi = {
  righe: [r("vecchio", ORA - 2 * GIORNO, "scaduto"), r("stamattina", ORA - ORE, "oggi"), r("dopo", ORA + 3 * ORE, "oggi")],
  call: [{ id: "k1", leadId: "dopo", company: "Officina dopo", contactName: null, phone: null, kind: "conoscenza", scheduledAt: ORA + 3 * ORE, meetLink: null, scheda: null }],
  totale: 3,
};
const pagina = (d: DatiOggi = DATI) => render(<Oggi ora={ORA} />, { percorso: "/commerciale/oggi", dati: [[["today", "mie"], d], [["stages"], FASI], [["tasks", "mie"], []]] });

describe("modifica 22: Oggi, una lista sola", () => {
  it("titolo con il numero delle righe; via Adesso, Lunedì, Diario, proposte e numeri del giorno", () => {
    const html = pagina();
    expect(html).toContain(titoloOggi(3));
    expect(titoloOggi(3)).toBe("Oggi, 3 da fare");
    expect(html.match(/<li data-lead=/g)?.length).toBe(3);
    for (const via of ["Adesso", "Lunedì", "Diario", "Proposte da seguire", "Numeri del giorno", "Fermi da 7 giorni"]) expect(html).not.toContain(via);
    expect(html).toContain("Da fare oggi");
    expect(html).toContain("Call di oggi");
    expect(html).toContain('href="/commerciale/call/k1"');
  });

  it("ordine: scaduti dal più vecchio (rosso), poi oggi; una sola azione primaria", () => {
    const html = pagina();
    expect(html.indexOf("Officina vecchio")).toBeLessThan(html.indexOf("Officina stamattina"));
    expect(html.indexOf("Officina stamattina")).toBeLessThan(html.indexOf("Officina dopo"));
    expect(html).toContain("scaduta da 2 g");
    expect(html).toContain("text-[#B42318]");
    expect(contaPrimari(html)).toBe(1);
  });

  it("segmento Miei e Tutti, link alla tabella con lo stesso filtro", () => {
    const html = pagina();
    expect(html).toContain(">Miei<");
    expect(html).toContain(">Tutti<");
    expect(html).toContain("/commerciale/lead?scad=oggi");
  });

  it("niente da fare: stato vuoto, titolo a zero", () => {
    const html = pagina({ righe: [], call: [], totale: 0 });
    expect(html).toContain("Oggi, niente da fare");
    expect(html).toContain("Niente da fare oggi");
    expect(html).not.toContain("Call di oggi");
  });

  it("i comandi aprono il foglio giusto o la scheda", () => {
    expect(aperturaDi("segna_esito")).toBe("esito");
    expect(aperturaDi("segna_consulenza")).toBe("esito");
    expect(aperturaDi("fissa_presentazione")).toBe("fissa");
    expect(aperturaDi("rimanda")).toBe("rimanda");
    expect(aperturaDi("apri_videochiamata")).toBe("meet");
    expect(aperturaDi("sposta_call")).toBe("scheda");
    expect(aperturaDi("non_presentato")).toBe("scheda");
  });

  it("badge del Commerciale: il numero intero, niente 9+, a zero sparisce", () => {
    expect(render(<BadgeIntero n={12} etichetta="da fare oggi" />)).toContain(">12<");
    expect(render(<BadgeIntero n={12} etichetta="da fare oggi" />)).not.toContain("9+");
    expect(render(<BadgeIntero n={0} etichetta="da fare oggi" />)).toBe("");
  });
});
