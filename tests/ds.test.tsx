import { describe, expect, it } from "vitest";
import { Avatar, Badge, CampoQuando, CardLead, Chip, Contatto, Intestazione, Pulsante, Punto, Selettore, StatoVuoto, classiPulsante } from "../src/ds";
import { contaPrimari, render } from "./render";

const ORA = Date.UTC(2026, 9, 13, 8, 0);

describe("Pulsante", () => {
  it("marca la variante e blocca il click mentre lavora", () => {
    const html = render(<Pulsante variante="primario" inCorso>Salva esito</Pulsante>);
    expect(html).toContain('data-variante="primario"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(contaPrimari(html)).toBe(1);
  });
  it("spento ma spiegabile resta focalizzabile", () => {
    const html = render(<Pulsante motivoSpento="Manca il telefono">Chiama</Pulsante>);
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain("disabled=\"\"");
  });
  it("le classi per misura sono quelle del DS", () => {
    expect(classiPulsante("primario", "lg")).toContain("h-12");
    expect(classiPulsante("secondario", "md")).toContain("border-ink");
  });
});

describe("Contatto", () => {
  const lead = { contactName: "Luca Bertini", phone: "+393331234567", email: "luca@esempio.it", meetLink: "https://meet.google.com/abc" };
  it("chiama con il nome di battesimo e tel:", () => {
    const html = render(<Contatto tipo="chiama" lead={lead} variante="primario" />);
    expect(html).toContain('href="tel:+393331234567"');
    expect(html).toContain("Chiama Luca");
  });
  it("WhatsApp con il testo del modello", () => {
    expect(render(<Contatto tipo="whatsapp" lead={lead} testo="Ciao Luca" />)).toContain("https://wa.me/393331234567?text=Ciao%20Luca");
  });
  it("senza telefono diventa un pulsante spento con il motivo", () => {
    const html = render(<Contatto tipo="chiama" lead={{ contactName: null, phone: null }} />);
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain(">Chiama<");
  });
  it("WhatsApp ha il nome accessibile e l'email dice Scrivi", () => {
    expect(render(<Contatto tipo="whatsapp" lead={lead} />)).toContain('aria-label="Scrivi su WhatsApp"');
    expect(render(<Contatto tipo="email" lead={lead} />)).toContain(">Scrivi<");
  });
  it("Meet apre in una scheda nuova", () => {
    const html = render(<Contatto tipo="meet" lead={lead} />);
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Apri Meet");
  });
});

describe("segni, chip e intestazione", () => {
  it("badge sparisce a zero e si ferma a 9+", () => {
    expect(render(<Badge n={0} />)).toBe("");
    expect(render(<Badge n={14} />)).toContain("9+");
  });
  it("punto con etichetta per lo screen reader", () => {
    expect(render(<Punto colore="verde" etichetta="Punteggio alto" />)).toContain("Punteggio alto");
  });
  it("avatar con l'iniziale", () => {
    expect(render(<Avatar nome="diego" />)).toContain(">D<");
  });
  it("chip con stato premuto e conteggio", () => {
    const html = render(<Chip selezionato conteggio={4}>Da richiamare</Chip>);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(">4<");
  });
  it("intestazione con il numero in evidenza", () => {
    const html = render(<Intestazione titolo="Oggi" numero={4} coda="da fare" eyebrow="martedì 13 ottobre" />);
    expect(html).toContain("<h1");
    expect(html).toMatch(/Oggi, <strong[^>]*>4<\/strong> da fare/);
  });
  it("selettore chiuso: riga da 48 px con etichetta, \"Scegli\" e freccia, nessuna opzione visibile", () => {
    const html = render(<Selettore etichetta="Esito" valore={null} onCambia={() => {}} opzioni={[{ valore: "a", etichetta: "Non risponde" }, { valore: "b", etichetta: "Risposto" }]} />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/<button[^>]*class="[^"]*h-12/);
    expect(html).toContain(">Esito<");
    expect(html).toContain(">Scegli<");
    expect(html).not.toContain('role="option"');
  });
  it("selettore aperto: opzioni inline da 44 px, spunta solo sulla scelta", () => {
    const html = render(<Selettore etichetta="Esito" valore="b" apertoAllInizio onCambia={() => {}} opzioni={[{ valore: "a", etichetta: "Non risponde" }, { valore: "b", etichetta: "Risposto" }, { valore: "c", etichetta: "Occupato", meta: "3" }]} />);
    expect(html.match(/role="option"/g)?.length).toBe(3);
    expect(html.match(/aria-selected="true"/g)?.length).toBe(1);
    expect(html.match(/data-spunta/g)?.length).toBe(1);
    expect(html).toMatch(/role="option"[^>]*class="[^"]*h-11/);
    expect(html).not.toContain("<dialog");
    expect(html.indexOf("Non risponde")).toBeLessThan(html.indexOf("Occupato"));
  });
  it("selettore con più di otto opzioni: si apre in un foglio dal basso", () => {
    const opzioni = Array.from({ length: 9 }, (_, i) => ({ valore: `f${i}`, etichetta: `Fase ${i}` }));
    const html = render(<Selettore etichetta="Fase" valore="f2" apertoAllInizio onCambia={() => {}} opzioni={opzioni} />);
    expect(html).toContain("<dialog");
    expect(html.match(/role="option"/g)?.length).toBe(9);
    expect(html).toContain(">Fase 2<");
  });
  it("quando: i preset e \"Altro giorno e ora\", senza campo data finché non serve", () => {
    const html = render(<CampoQuando etichetta="Quando" valore={null} onCambia={() => {}} ora={ORA} apertoAllInizio />);
    expect(html).toContain("Domani 10:00");
    expect(html).toContain("Altro giorno e ora");
    expect(html).not.toContain('type="datetime-local"');
  });
  it("quando: il preset scelto resta marcato anche se l'orologio è andato avanti", () => {
    // valore = "Tra 1 ora" calcolato su ORA; il componente congela ORA e confronta con quello
    const html = render(<CampoQuando etichetta="Quando" valore={ORA + 3_600_000} onCambia={() => {}} ora={ORA} apertoAllInizio />);
    expect(html.match(/aria-selected="true"/g)?.length).toBe(1);
    expect(html).toMatch(/aria-selected="true"[^>]*>.*?Tra 1 ora/);
    expect(html).not.toContain('type="datetime-local"');
  });
  it("quando: un valore fuori dai preset apre il campo data e ora", () => {
    const html = render(<CampoQuando etichetta="Quando" valore={ORA + 5 * 86_400_000} onCambia={() => {}} ora={ORA} />);
    expect(html).toContain('type="datetime-local"');
  });
  it("selettore: l'elenco ha le etichette e la riga resta raggiungibile da tastiera", () => {
    const html = render(<Selettore etichetta="Esito" valore="a" apertoAllInizio onCambia={() => {}} opzioni={[{ valore: "a", etichetta: "Uno" }, { valore: "b", etichetta: "Due" }]} />);
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-label="Esito"');
    expect(html).toMatch(/<button[^>]*aria-expanded="true"/);
  });
  it("le card avorio hanno il bordo sabbia e nessuna ombra", () => {
    const html = render(<CardLead ora={ORA} lead={{ id: "l1", company: "Officina", stageLabel: "Nuovo", stageChangedAt: ORA }} />);
    expect(html).toContain("border-sabbia");
    expect(html).not.toContain("shadow");
  });
  it("stato vuoto senza pulsante pieno se non serve", () => {
    expect(contaPrimari(render(<StatoVuoto titolo="Tutto fatto" testo="Niente in scadenza." />))).toBe(0);
  });
});

describe("CardLead", () => {
  it("una riga per fatto, nell'ordine del DS", () => {
    const html = render(
      <CardLead ora={ORA} lead={{ id: "l1", company: "Officina Prova", contactName: "Luca Prova", nextAction: "Richiamare", nextActionAt: ORA - 3_600_000, stageLabel: "Da richiamare", stageChangedAt: ORA - 9 * 86_400_000, score: "verde", setupCents: 200_000, feeCents: 15_000 }} />,
    );
    const ordine = ["Officina Prova", "Luca Prova", "Richiamare", "scaduta da 1 h", "Setup € 2.000, canone € 150", "fermo da 9 giorni"];
    const posizioni = ordine.map((t) => html.indexOf(t));
    expect(posizioni.every((p) => p >= 0)).toBe(true);
    expect([...posizioni].sort((a, b) => a - b)).toEqual(posizioni);
    expect(html).toContain('href="/commerciale/lead/l1"');
  });
});
