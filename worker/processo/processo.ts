import { daRoma, partiRoma } from "../lib/roma";
import { ORARIO_DEFAULT, scadenzaLavorativa, type Orario } from "../regole/orario";

// Funzione unica del processo di vendita (contratto blocco 1, sezione 2): riceve il lead e l'ora e dice
// azione, scadenza, pulsante, responsabile e passo successivo. Scheda, tabella, Oggi, promemoria e Numeri
// la leggono; nessuno di loro calcola niente da sé. Funzione pura: niente database, niente orologio.

// Percorso a cinque chiamate (modifica 25): gli id vecchi restano, cambiano etichetta e ordine.
export const FASE = {
  nuovo: "da-chiamare-prima-volta",
  richiamare: "da-richiamare",
  conoscenza: "appuntamento-confermato",
  attesaOfferta: "in-attesa-preventivo",
  offerta: "presentazione-confermata",
  analisi: "analisi-fissata",
  attesaProgetto: "in-attesa-progetto",
  progetto: "progetto-fissato",
  decisione: "in-attesa-decisione",
  cliente: "chiuso",
  perso: "non-chiuso",
  nonProfilato: "fake",
} as const;

// Fasi da 10 a 60: hanno sempre una e una sola azione con scadenza.
export const FASI_APERTE: string[] = [
  FASE.nuovo, FASE.richiamare, FASE.conoscenza, FASE.attesaOfferta, FASE.offerta, FASE.analisi, FASE.attesaProgetto, FASE.progetto, FASE.decisione,
];

// Codici delle azioni: l'interfaccia li traduce in fogli e link, il testo lo decide la funzione.
export type CodiceAzione =
  | "chiama" | "apri_videochiamata" | "segna_esito" | "segna_decisione" | "sposta_call" | "non_presentato" | "rimanda" | "apri_cliente" | "riapri"
  | "fissa_conoscenza" | "fissa_offerta" | "fissa_analisi" | "fissa_progetto"
  | "segna_conoscenza" | "segna_offerta" | "segna_analisi" | "segna_progetto"
  | "segna_offerta_pronta" | "segna_progetto_pronto";
export type Comando = { testo: string; codice: CodiceAzione };
export type Ruolo = "primaChiamata" | "presentazione";
export type StatoScadenza = "scaduto" | "oggi" | "futuro";

export type LeadPerProcesso = {
  stageId: string; company: string; contactName: string | null;
  createdAt: number; stageChangedAt: number;
  nextAction: string | null; nextActionAt: number | null;
  attemptCount: number; pausedUntil: number | null; noShow?: number | null;
  // Facoltativi, dati da chi chiama quando li ha: link della call in programma, proposta collegata, data della call dell'offerta.
  meetLink?: string | null; haProposta?: boolean; offertaAt?: number | null;
};

export type RegoleProcesso = { orario: Orario; minutiPrimaChiamata: number; massimoTentativi: number };
export const REGOLE_BASE: RegoleProcesso = { orario: ORARIO_DEFAULT, minutiPrimaChiamata: 30, massimoTentativi: 5 };

export type ProssimaAzione = {
  azione: string | null;
  scadenza: number | null;
  stato: StatoScadenza | null;
  pulsante: Comando | null;
  secondarie: Comando[];
  responsabile: Ruolo | null;
  poi: string | null;
  tentativo: number | null; // n del "Tentativo n di 5", solo nelle fasi 10 e 20
  massimoTentativi: number;
};

const GIORNO = 86_400_000;
const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export const dataTesto = (ms: number) => {
  const p = partiRoma(ms);
  return `${GIORNI[p.settimana]} ${p.giorno} ${MESI[p.mese - 1]}`;
};

export const nomeDi = (l: { contactName: string | null; company: string }) => l.contactName?.trim().split(/\s+/)[0] || l.company;

// Rosso solo oltre un giorno di ritardo; arancione quello che scade entro oggi (anche se già passato da poco); grigio il futuro.
export function statoScadenza(scadenza: number | null, adesso: number): StatoScadenza | null {
  if (scadenza == null) return null;
  if (adesso - scadenza > GIORNO) return "scaduto";
  const p = partiRoma(adesso);
  return scadenza < daRoma(p.anno, p.mese, p.giorno + 1) ? "oggi" : "futuro";
}

// Giorni lavorativi dopo un istante, alla chiusura dell'orario: "entro venerdì".
export function giorniLavorativiDopo(da: number, n: number, orario: Orario): number {
  const p = partiRoma(da);
  const [hc, mc] = orario.fine.split(":").map(Number);
  let contati = 0;
  for (let k = 1; k < 60; k++) {
    const t = daRoma(p.anno, p.mese, p.giorno + k, hc, mc);
    if (orario.giorni.includes(partiRoma(t).settimana) && ++contati === n) return t;
  }
  return daRoma(p.anno, p.mese, p.giorno + n, hc, mc);
}

// Il giorno lavorativo prima di un istante, alla chiusura dell'orario.
export function giornoLavorativoPrima(a: number, orario: Orario): number {
  const p = partiRoma(a);
  const [hc, mc] = orario.fine.split(":").map(Number);
  for (let k = 1; k < 8; k++) {
    const t = daRoma(p.anno, p.mese, p.giorno - k, hc, mc);
    if (orario.giorni.includes(partiRoma(t).settimana)) return t;
  }
  return daRoma(p.anno, p.mese, p.giorno - 1, hc, mc);
}

// 10 e 20 a chi fa la prima chiamata (Diego); dalla 30 alla 70 a chi presenta (Tommaso). Modifica 25.
export const ruoloDellaFase = (stageId: string): Ruolo | null =>
  [FASE.nuovo, FASE.richiamare].includes(stageId as never) ? "primaChiamata"
  : [...FASI_APERTE.slice(2), FASE.cliente].includes(stageId) ? "presentazione"
  : null;

// Azioni salvate dalla transizione dopo un "Non si è presentato" (prima e seconda assenza).
export const AZIONE_RIFISSARE = "Rifissare la call";
export const AZIONE_RIPROVARE = "Riprovare dopo la pausa";
// Azioni salvate dalla transizione quando il materiale è pronto ma la call non c'è ancora.
export const AZIONE_FISSA_OFFERTA = "Fissare la call dell'offerta";
export const AZIONE_FISSA_ANALISI = "Fissare la call di analisi";
export const AZIONE_FISSA_PROGETTO = "Fissare la call del progetto";

// Le quattro fasi con una call (30, 40, 45, 55): parole e codici di ognuna.
type FaseCall = { titolo: (nome: string) => string; cosa: string; fissa: Comando; segna: Comando; poi: (salvata: number, nome: string, o: Orario) => string };
const FASI_CALL: Record<string, FaseCall> = {
  [FASE.conoscenza]: {
    titolo: (n) => `Conoscenza con ${n}`, cosa: "la conoscenza",
    fissa: { testo: "Fissa la call di conoscenza", codice: "fissa_conoscenza" }, segna: { testo: "Segna com'è andata la conoscenza", codice: "segna_conoscenza" },
    poi: (t, _n, o) => `Preparare l'offerta entro ${dataTesto(giorniLavorativiDopo(t, 3, o))}`,
  },
  [FASE.offerta]: {
    titolo: (n) => `Offerta con ${n}`, cosa: "l'offerta",
    fissa: { testo: "Fissa la call dell'offerta", codice: "fissa_offerta" }, segna: { testo: "Segna com'è andata l'offerta", codice: "segna_offerta" },
    poi: () => AZIONE_FISSA_ANALISI,
  },
  [FASE.analisi]: {
    titolo: (n) => `Fai l'analisi con ${n}`, cosa: "l'analisi",
    fissa: { testo: "Fissa la call di analisi", codice: "fissa_analisi" }, segna: { testo: "Segna com'è andata l'analisi", codice: "segna_analisi" },
    poi: (t, _n, o) => `Preparare il progetto entro ${dataTesto(giorniLavorativiDopo(t, 3, o))}`,
  },
  [FASE.progetto]: {
    titolo: () => "Presenta il progetto e chiudi", cosa: "la call del progetto",
    fissa: { testo: "Fissa la call del progetto", codice: "fissa_progetto" }, segna: { testo: "Segna com'è andata la call del progetto", codice: "segna_progetto" },
    poi: (_t, n) => `Sentire ${n} per la decisione`,
  },
};

const comando = (testo: string, codice: CodiceAzione): Comando => ({ testo, codice });

export function prossimaAzione(lead: LeadPerProcesso, adesso: number, regole: RegoleProcesso = REGOLE_BASE): ProssimaAzione {
  const nome = nomeDi(lead);
  const chiama = comando(`Chiama ${nome}`, "chiama");
  const massimo = regole.massimoTentativi;
  const base = { responsabile: ruoloDellaFase(lead.stageId), massimoTentativi: massimo, poi: null, tentativo: null, secondarie: [] as Comando[] };
  // Invariante: nelle fasi aperte la scadenza c'è sempre. Se manca il dato salvato vale il cambio di fase.
  const salvata = lead.nextActionAt ?? lead.stageChangedAt;
  const fine = (azione: string, scadenza: number, resto: Partial<ProssimaAzione> & { pulsante: Comando | null }): ProssimaAzione =>
    ({ ...base, ...resto, azione, scadenza, stato: statoScadenza(scadenza, adesso) });
  const inPausa = lead.pausedUntil != null;

  switch (lead.stageId) {
    case FASE.nuovo: {
      // Una data scelta a mano vince; altrimenti la prima chiamata scade coi minuti in orario di lavoro.
      const scadenza = lead.nextActionAt != null && lead.nextActionAt > lead.createdAt
        ? lead.nextActionAt
        : scadenzaLavorativa(lead.createdAt, regole.minutiPrimaChiamata, regole.orario);
      return fine("Prima chiamata", scadenza, {
        pulsante: chiama, tentativo: lead.attemptCount + 1,
        secondarie: [comando("Segna l'esito", "segna_esito"), FASI_CALL[FASE.conoscenza].fissa],
      });
    }
    case FASE.richiamare: {
      const n = Math.min(lead.attemptCount + 1, massimo);
      // Dopo il quinto tentativo a vuoto: pausa, poi un'ultima chiamata.
      const azione = inPausa ? `Ultima chiamata dopo la pausa: ${dataTesto(lead.pausedUntil!)}`
        : lead.attemptCount >= massimo ? "Ultima chiamata dopo la pausa" : `Richiamare: tentativo ${n} di ${massimo}`;
      return fine(azione, salvata, {
        pulsante: chiama, tentativo: n,
        secondarie: [comando("Segna l'esito", "segna_esito"), FASI_CALL[FASE.conoscenza].fissa],
      });
    }
    case FASE.conoscenza:
    case FASE.offerta:
    case FASE.analisi:
    case FASE.progetto: {
      const f = FASI_CALL[lead.stageId];
      // No-show: la data è tolta, si rifissa (o si riprova dopo la pausa della seconda assenza).
      if ((lead.noShow ?? 0) > 0 && lead.nextAction === AZIONE_RIPROVARE && !inPausa) {
        // Pausa finita dopo la seconda assenza: un'ultima chiamata, a vuoto il lead va in 80.
        return fine("Ultima chiamata dopo la pausa", salvata, { pulsante: chiama, secondarie: [comando("Segna l'esito", "segna_esito"), f.fissa] });
      }
      if ((lead.noShow ?? 0) > 0 && (lead.nextAction === AZIONE_RIFISSARE || lead.nextAction === AZIONE_RIPROVARE)) {
        const azione = inPausa ? `Riprovare il ${dataTesto(lead.pausedUntil!)}` : `Rifissare ${f.cosa}`;
        return fine(azione, salvata, {
          pulsante: inPausa ? chiama : f.fissa,
          secondarie: inPausa ? [comando("Segna l'esito", "segna_esito")] : [comando(`Chiama ${nome}`, "chiama")],
        });
      }
      // Offerta fatta senza la call di analisi: si fissa la call (2 giorni lavorativi, salvati dalla transizione).
      if (lead.stageId === FASE.offerta && lead.nextAction === AZIONE_FISSA_ANALISI) {
        return fine("Fissa la call di analisi", salvata, { pulsante: FASI_CALL[FASE.analisi].fissa, secondarie: [chiama] });
      }
      const iniziata = adesso >= salvata;
      const pulsante = iniziata ? f.segna : lead.meetLink ? comando("Apri la videochiamata", "apri_videochiamata") : chiama;
      return fine(f.titolo(nome), salvata, {
        pulsante, poi: f.poi(salvata, nome, regole.orario),
        secondarie: [comando("Sposta la call", "sposta_call"), comando("Non si è presentato", "non_presentato")],
      });
    }
    case FASE.attesaOfferta:
    case FASE.attesaProgetto: {
      // Prepara entro 3 giorni lavorativi dall'ingresso in fase; la call va fissata entro 4 (decisione di Tommaso, 28/10).
      const offerta = lead.stageId === FASE.attesaOfferta;
      const daFissare = offerta ? AZIONE_FISSA_OFFERTA : AZIONE_FISSA_PROGETTO;
      const pronto = lead.nextAction === daFissare || (offerta && !!lead.haProposta);
      const callAt = offerta ? lead.offertaAt ?? null : null;
      if (pronto && callAt == null) {
        const fissa = FASI_CALL[offerta ? FASE.offerta : FASE.progetto].fissa;
        return fine(fissa.testo, giorniLavorativiDopo(lead.stageChangedAt, 4, regole.orario), { pulsante: fissa, secondarie: [chiama] });
      }
      const scadenza = callAt != null ? giornoLavorativoPrima(callAt, regole.orario) : giorniLavorativiDopo(lead.stageChangedAt, 3, regole.orario);
      return fine(offerta ? "Prepara l'offerta con la forbice" : "Prepara il progetto", scadenza, {
        pulsante: offerta ? comando("Segna l'offerta pronta", "segna_offerta_pronta") : comando("Segna il progetto pronto", "segna_progetto_pronto"),
        poi: callAt != null ? `Offerta ${dataTesto(callAt)}` : daFissare,
      });
    }
    case FASE.decisione: {
      const azione = inPausa ? `Riprovare il ${dataTesto(lead.pausedUntil!)}` : `Sentire ${nome} per la decisione`;
      return fine(azione, salvata, { pulsante: chiama, secondarie: [comando("Segna la decisione", "segna_decisione"), comando("Rimanda", "rimanda")] });
    }
    case FASE.cliente:
      return { ...base, azione: null, scadenza: null, stato: null, pulsante: comando("Apri il cliente", "apri_cliente") };
    default:
      // 80 e 90: nessuna azione, si può solo riaprire.
      return { ...base, responsabile: null, azione: null, scadenza: null, stato: null, pulsante: null, secondarie: [comando("Riapri", "riapri")] };
  }
}
