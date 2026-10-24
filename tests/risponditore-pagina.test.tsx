import { describe, expect, it } from "vitest";
import { Risponditore, type DatiRisponditore } from "../src/pagine/automazioni/Risponditore";
import { linkScheda } from "../src/pagine/pubbliche/Risorsa";
import { contaPrimari, render } from "./render";

const ORA = 1_800_000_000_000;
const GIORNO = 86_400_000;
const campagna = {
  id: "c1", nome: "Guida casa", parola: "casa", mediaId: null, rispostePubbliche: ["Ti ho scritto"], testoPrivato: "Ciao",
  etichettaPulsante: "Mandami il link", risorsaSlug: "guida", testoLink: "Eccola", attiva: true, creataIl: ORA,
};
const evento = (commentoId: string, stato: DatiRisponditore["eventi"][number]["stato"], motivo: string | null = null) => ({
  commentoId, mediaId: "m1", autoreNome: `utente_${commentoId}`, testo: "Voglio la guida casa", campagnaId: "c1", parola: "casa", stato, motivo, creatoIl: ORA - 60_000,
});
const pieni: DatiRisponditore = {
  account: { username: "acceleriamo", scadeIl: ORA + 40 * GIORNO, ultimoErrore: null },
  campagne: [campagna, { ...campagna, id: "c2", nome: "Preventivi", parola: "preventivo", mediaId: "1789", attiva: false }],
  eventi: [evento("a", "inviato"), evento("b", "link_inviato"), evento("c", "ignorato", "nessuna campagna con questa parola"), evento("d", "errore", "accesso a Instagram scaduto"), evento("e", "in_corso")],
  richieste: [{ id: "r1", nome: "Mario Rossi", azienda: "Rossi Srl", telefono: "333 123 4567", slug: "guida", risorsa: "La guida", creataIl: ORA - GIORNO }],
  risorse: [{ slug: "guida", titolo: "La guida", attiva: true }],
};
const pagina = (dati: DatiRisponditore) => render(<Risponditore ora={ORA} />, { dati: [[["risponditore"], dati]] });

describe("schermata del risponditore", () => {
  it("account, campagne, richieste e registro con le etichette giuste, un solo primario", () => {
    const html = pagina(pieni);
    expect(html).toContain("Collegato come @acceleriamo");
    expect(html).toContain("Rinnovo tra 40 giorni");
    expect(html).toContain("Guida casa");
    expect(html).toContain("Parola: casa");
    expect(html).toContain("Tutti i post");
    expect(html).toContain("Post 1789");
    expect(html).toContain("Spenta");
    for (const s of ["Inviato", "Link mandato", "Ignorato", "Errore", "In corso"]) expect(html).toContain(`</span>${s}</p>`);
    expect(html).toContain("accesso a Instagram scaduto");
    expect(html).toContain("Mario Rossi");
    expect(html).toContain("Rossi Srl");
    expect(html).toContain('href="tel:3331234567"');
    expect(html).toContain("Dalla risorsa: La guida");
    expect(html).toContain("Nuova campagna");
    expect(contaPrimari(html)).toBe(1);
    expect(html).not.toMatch(/[\u2013\u2014]/);
  });
  it("registro: etichetta Instagram o Facebook per riga, su Facebook il nome senza @", () => {
    const html = pagina({ ...pieni, eventi: [evento("a", "inviato"), { ...evento("f", "inviato"), piattaforma: "fb", autoreNome: "Mario Bianchi" }] });
    expect(html).toContain("Instagram · Parola: casa");
    expect(html).toContain("Facebook · Parola: casa");
    expect(html).toContain("@utente_a");
    expect(html).toContain(">Mario Bianchi</p>");
  });
  it("senza account e senza dati: stati vuoti disegnati", () => {
    const html = pagina({ account: null, campagne: [], eventi: [], richieste: [], risorse: [] });
    expect(html).toContain("Nessun account collegato");
    expect(html).toContain("Collega l&#x27;account");
    expect(html).toContain("Nessuna campagna");
    expect(html).toContain("Nessuna richiesta di chiamata");
    expect(html).toContain("Nessun commento ancora");
    expect(contaPrimari(html)).toBe(1);
  });
  it("ultimo errore dell'account in chiaro", () => {
    const html = pagina({ ...pieni, account: { username: "acceleriamo", scadeIl: ORA + GIORNO, ultimoErrore: "token scaduto" } });
    expect(html).toContain("Rinnovo tra 1 giorno");
    expect(html).toContain("Ultimo errore: token scaduto");
  });
  it("errore di caricamento: messaggio e Riprova", () => {
    const html = render(<Risponditore ora={ORA} />, { errori: [[["risponditore"], new Error("Errore del server")]] });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Riprova");
  });
});

describe("pagina risorsa: link della scheda", () => {
  it("solo http o https", () => {
    expect(linkScheda("https://esempio.it/a.pdf")).toBe("https://esempio.it/a.pdf");
    expect(linkScheda("http://esempio.it/a.pdf")).toBe("http://esempio.it/a.pdf");
    for (const u of ["javascript:alert(1)", "data:text/html,x", "", null]) expect(linkScheda(u)).toBeNull();
  });
});
