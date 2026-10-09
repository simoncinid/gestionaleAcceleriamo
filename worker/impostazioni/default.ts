import { z } from "zod";
import { ORARIO_DEFAULT } from "../regole/orario";

const ora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario nel formato 08:30");

export const SCHEMI = {
  orario: z.object({ giorni: z.array(z.number().int().min(0).max(6)).min(1, "Almeno un giorno"), inizio: ora, fine: ora }).strict(),
  sequenze: z.object({ attive: z.boolean() }).strict(),
  punteggio: z.array(z.object({ campo: z.string().trim().min(1).max(60), operatore: z.enum(["contiene", "non_contiene", "presente"]), valore: z.string().max(120), punti: z.number().int().min(-5).max(5) }).strict()).max(30),
  motivi: z.array(z.object({ id: z.string().min(1).max(40), etichetta: z.string().trim().min(1).max(60) }).strict()).min(1),
  assegnazione: z.object({
    primaChiamata: z.string().min(1), presentazione: z.string().min(1), proposta: z.string().min(1),
    via: z.object({ utente: z.string().nullable(), fino: z.number().int().nullable() }).strict(),
  }).strict(),
  conferma: z.object({ attiva: z.boolean(), mittente: z.string().min(3).max(200), rispondiA: z.string().email(), piede: z.string().max(600) }).strict(),
  foglio: z.object({
    attivo: z.boolean(), spreadsheetId: z.string().max(200), scheda: z.string().max(100),
    mappa: z.object({ data: z.string(), azienda: z.string(), referente: z.string(), telefono: z.string(), email: z.string(), campagna: z.string(), inserzione: z.string(), metaId: z.string() }).strict(),
  }).strict(),
  prezzi: z.object({ setupCents: z.number().int().min(0), ore: z.number().int().min(0), moltiplicatore: z.number().min(5).max(10) }).strict(),
  validita: z.object({ giorni: z.number().int().min(1).max(365) }).strict(),
  fatture: z.object({ scadenzaGiorni: z.number().int().min(0).max(120) }).strict(),
  obiettivo: z.object({ ricorrenteCents: z.number().int().min(0) }).strict(),
};

export type Impostazioni = { [K in keyof typeof SCHEMI]: z.infer<(typeof SCHEMI)[K]> };

export const IMPOSTAZIONI_DEFAULT: Impostazioni = {
  orario: ORARIO_DEFAULT,
  sequenze: { attive: false },
  punteggio: [
    { campo: "email", operatore: "non_contiene", valore: "gmail.", punti: 1 },
    { campo: "website", operatore: "presente", valore: "", punti: 1 },
  ],
  motivi: [
    { id: "non_raggiungibile", etichetta: "Non raggiungibile" },
    { id: "non_interessato", etichetta: "Non interessato" },
    { id: "budget", etichetta: "Budget" },
    { id: "fuori_target", etichetta: "Fuori target" },
    { id: "privato", etichetta: "Privato" },
    { id: "fake", etichetta: "Fake" },
    { id: "gia_servito", etichetta: "Già servito" },
    { id: "altro", etichetta: "Altro" },
  ],
  assegnazione: { primaChiamata: "tommaso", presentazione: "diego", proposta: "diego", via: { utente: null, fino: null } },
  conferma: {
    attiva: true,
    mittente: "Tommaso di Acceleriamo <tommaso@mail.acceleriamo.it>",
    rispondiA: "tommaso@acceleriamo.it",
    piede: "Acceleriamo è un progetto di Diego Simoncini, P.IVA 02524780505. Informativa privacy: https://acceleriamo.it/privacy",
  },
  foglio: {
    attivo: false, spreadsheetId: "", scheda: "",
    mappa: { data: "Data di creazione", azienda: "Azienda", referente: "Nome e Cognome", telefono: "Telefono", email: "Email", campagna: "Campagna", inserzione: "", metaId: "" },
  },
  prezzi: { setupCents: 200_000, ore: 40, moltiplicatore: 7 },
  validita: { giorni: 30 },
  fatture: { scadenzaGiorni: 15 },
  obiettivo: { ricorrenteCents: 200_000 },
};
