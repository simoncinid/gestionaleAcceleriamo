import { daRoma, partiRoma } from "../lib/roma";
import { ORARIO_DEFAULT, scadenzaLavorativa, type Orario } from "../regole/orario";

// Funzione unica del processo di vendita (contratto blocco 1, sezione 2): riceve il lead e l'ora e dice
// azione, scadenza, pulsante, responsabile e passo successivo. Scheda, tabella, Oggi, promemoria e Numeri
// la leggono; nessuno di loro calcola niente da sé. Funzione pura: niente database, niente orologio.

export const FASE = {
  nuovo: "da-chiamare-prima-volta",
  richiamare: "da-richiamare",
  consulenza: "appuntamento-confermato",
  preventivo: "in-attesa-preventivo",
  presentazione: "presentazione-confermata",
  decisione: "in-attesa-decisione",
  cliente: "chiuso",
  perso: "non-chiuso",
  nonProfilato: "fake",
} as const;

// Fasi da 10 a 60: hanno sempre una e una sola azione con scadenza.
export const FASI_APERTE: string[] = [FASE.nuovo, FASE.richiamare, FASE.consulenza, FASE.preventivo, FASE.presentazione, FASE.decisione];

// Codici delle azioni: l'interfaccia li traduce in fogli e link, il testo lo decide la funzione.
export type CodiceAzione =
  | "chiama" | "apri_videochiamata" | "segna_consulenza" | "segna_presentazione" | "segna_preventivo" | "segna_esito"
  | "fissa_consulenza" | "fissa_presentazione" | "sposta_call" | "non_presentato" | "segna_decisione" | "rimanda" | "apri_cliente" | "riapri";
export type Comando = { testo: string; codice: CodiceAzione };
export type Ruolo = "primaChiamata" | "presentazione";
export type StatoScadenza = "scaduto" | "oggi" | "futuro";

export type LeadPerProcesso = {
  stageId: string; company: string; contactName: string | null;
  createdAt: number; stageChangedAt: number;
  nextAction: string | null; nextActionAt: number | null;
  attemptCount: number; pausedUntil: number | null; noShow?: number | null;
  // Facoltativi, dati da chi chiama quando li ha: link della call in programma, proposta collegata, data della presentazione.
  meetLink?: string | null; haProposta?: boolean; presentazioneAt?: number | null;
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

export const ruoloDellaFase = (stageId: string): Ruolo | null =>
  [FASE.nuovo, FASE.richiamare, FASE.consulenza].includes(stageId as never) ? "primaChiamata"
  : [FASE.preventivo, FASE.presentazione, FASE.decisione, FASE.cliente].includes(stageId as never) ? "presentazione"
  : null;

// Azioni salvate dalla transizione dopo un "Non si è presentato" (prima e seconda assenza).
export const AZIONE_RIFISSARE = "Rifissare la call";
export const AZIONE_RIPROVARE = "Riprovare dopo la pausa";

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
        secondarie: [comando("Segna l'esito", "segna_esito"), comando("Fissa una consulenza", "fissa_consulenza")],
      });
    }
    case FASE.richiamare: {
      const n = Math.min(lead.attemptCount + 1, massimo);
      const azione = inPausa ? `Ultima chiamata dopo la pausa: ${dataTesto(lead.pausedUntil!)}` : `Richiamare: tentativo ${n} di ${massimo}`;
      return fine(azione, salvata, {
        pulsante: chiama, tentativo: n,
        secondarie: [comando("Segna l'esito", "segna_esito"), comando("Fissa una consulenza", "fissa_consulenza")],
      });
    }
    case FASE.consulenza:
    case FASE.presentazione: {
      const consulenza = lead.stageId === FASE.consulenza;
      const cosa = consulenza ? "la consulenza" : "la presentazione";
      // No-show: la data è tolta, si rifissa (o si riprova dopo la pausa della seconda assenza).
      if ((lead.noShow ?? 0) > 0 && (lead.nextAction === AZIONE_RIFISSARE || lead.nextAction === AZIONE_RIPROVARE)) {
        const azione = inPausa ? `Riprovare il ${dataTesto(lead.pausedUntil!)}` : `Rifissare ${cosa}`;
        return fine(azione, salvata, {
          pulsante: inPausa ? chiama : comando(consulenza ? "Fissa la consulenza" : "Fissa la presentazione", consulenza ? "fissa_consulenza" : "fissa_presentazione"),
          secondarie: inPausa ? [comando("Segna l'esito", "segna_esito")] : [comando(`Chiama ${nome}`, "chiama")],
        });
      }
      const azione = `${consulenza ? "Consulenza" : "Presentazione"} con ${nome}`;
      const iniziata = adesso >= salvata;
      const pulsante = iniziata
        ? comando(`Segna com'è andata ${cosa}`, consulenza ? "segna_consulenza" : "segna_presentazione")
        : lead.meetLink ? comando("Apri la videochiamata", "apri_videochiamata") : chiama;
      const poi = consulenza
        ? `Preparare il preventivo entro ${dataTesto(giorniLavorativiDopo(salvata, 2, regole.orario))}`
        : `Sentire ${nome} per la decisione`;
      return fine(azione, salvata, { pulsante, poi, secondarie: [comando("Sposta la call", "sposta_call"), comando("Non si è presentato", "non_presentato")] });
    }
    case FASE.preventivo: {
      // Preventivo pronto ma senza data della presentazione: tocca a chi fissa la call.
      if (lead.haProposta && lead.presentazioneAt == null) {
        return fine("Fissare la presentazione", salvata, {
          responsabile: "primaChiamata", pulsante: comando("Fissa la presentazione", "fissa_presentazione"), secondarie: [chiama],
        });
      }
      const scadenza = lead.presentazioneAt != null ? giornoLavorativoPrima(lead.presentazioneAt, regole.orario) : salvata;
      return fine("Preparare il preventivo", scadenza, {
        pulsante: comando("Segna il preventivo pronto", "segna_preventivo"),
        poi: lead.presentazioneAt != null ? `Presentazione ${dataTesto(lead.presentazioneAt)}` : "Fissare la presentazione",
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
