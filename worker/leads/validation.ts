import { z } from "zod";

// Link web: solo http o https (niente javascript:, data: e simili).
export const linkHttp = (messaggio: string) =>
  z
    .string()
    .trim()
    .url(messaggio)
    .refine((u) => /^https?:\/\//i.test(u), "Il link deve iniziare con http o https");

// I campi assenti restano assenti (undefined): così un PATCH non svuota quello che non manda.
const text = (max = 2000) =>
  z.string().trim().max(max).nullish().transform((v) => (v === undefined ? undefined : v || null));

const email = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v === undefined ? undefined : v || null))
  .refine((v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Email non valida");

const company = z.string().trim().min(1, "Serve il nome dell'azienda").max(200);

const fields = {
  contactName: text(200),
  email,
  phone: text(50),
  website: text(500),
  linkedinText: text(20000),
  stageId: z.string().min(1).optional(),
  estimatedValue: z.number().int().min(0).nullish(),
  ownerId: z.string().nullish(),
  nextAction: text(300),
  nextActionAt: z.number().int().nullish(),
  appointmentAt: z.number().int().nullish(),
  meetLink: text(500),
  proposalUrl: text(500),
  notes: text(20000),
};

// Motivo e dati del vinto solo in modifica: la creazione li rifiuta (.strict()).
const campiEsito = {
  setupCents: z.number().int().min(0).nullish(),
  feeCents: z.number().int().min(0).nullish(),
  // Stringa libera: i motivi validi stanno in Impostazioni (chiave "motivi") e si controllano nel servizio.
  lostReason: z.string().min(1).max(40).nullish(),
  wonStartAt: z.number().int().nullish(),
};

export const leadCreateSchema = z
  .object({ company, source: z.enum(["manuale", "sito", "passaparola", "altro"]).optional(), ...fields })
  .strict();

// clientName: nome del cliente che nasce alla chiusura (se manca si usa l'azienda del lead).
// callAt: giorno e ora della call quando la fase di arrivo ne richiede una (Q14).
export const leadPatchSchema = z
  .object({ company: company.optional(), ...fields, ...campiEsito, clientName: z.string().trim().min(1).max(200).optional(), callAt: z.number().int().optional() })
  .strict();

export const mergeSchema = z.object({ intoId: z.string().min(1) }).strict();

export const activitySchema = z
  .object({
    type: z.enum(["nota", "chiamata", "email"]),
    body: z.string().trim().min(1, "Scrivi qualcosa").max(20000),
  })
  .strict();

export const documentSchema = z
  .object({
    name: z.string().trim().min(1, "Serve un nome").max(200),
    url: linkHttp("Link non valido"),
  })
  .strict();

// Azioni multiple della Scaletta: da 1 a 15 lead per volta (tetto delle sottorichieste del piano gratuito).
export const bulkSchema = z
  .object({ ids: z.array(z.string().min(1)).min(1).max(15), azione: z.enum(["responsabile", "fase", "cestino"]), valore: z.string().nullish() })
  .strict();
