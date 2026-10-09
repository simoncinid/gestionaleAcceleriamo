import { z } from "zod";

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

export const leadPatchSchema = z.object({ company: company.optional(), ...fields, ...campiEsito }).strict();

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
    url: z
      .string()
      .trim()
      .url("Link non valido")
      .refine((u) => /^https?:\/\//i.test(u), "Il link deve iniziare con http o https"),
  })
  .strict();
