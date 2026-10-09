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

export const leadCreateSchema = z
  .object({ company, source: z.enum(["manuale", "sito", "passaparola", "altro"]).optional(), ...fields })
  .strict();

export const leadPatchSchema = z.object({ company: company.optional(), ...fields }).strict();

export const mergeSchema = z.object({ intoId: z.string().min(1) }).strict();
