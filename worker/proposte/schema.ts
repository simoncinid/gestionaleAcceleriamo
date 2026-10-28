import { z } from "zod";
import { PROPOSAL_STATUSES } from "../db/schema";

const euro = z.number().min(0).max(10_000_000).transform((v) => Math.round(v * 100));
// Solo https://: z.string().url() accetterebbe anche javascript: e altri schemi.
const linkPdf = z.string().trim().max(500).regex(/^https:\/\/\S+$/, "Il link deve iniziare con https://");
const giorno = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data nel formato 2026-11-08");

// Forbice dell'offerta (modifica 25): se c'è uno c'è l'altro, e "da" non supera "a".
const forbice = { forbiceDaCents: z.number().int().min(0).nullable().optional(), forbiceACents: z.number().int().min(0).nullable().optional() };
const forbiceValida = (v: { forbiceDaCents?: number | null; forbiceACents?: number | null }) => {
  const da = v.forbiceDaCents ?? null, a = v.forbiceACents ?? null;
  return (da == null) === (a == null) && (da == null || da <= a!);
};
const ERRORE_FORBICE = { message: "Forbice: scrivi da e a, con da non più alto di a", path: ["forbiceACents"] };

// Corpo dello script dopo-il-pdf: i campi del frontmatter (euro interi) più sourcePath.
export const hookSchema = z.object({
  numero: z.string().trim().min(1, "Serve il numero").max(40),
  lead: z.string().trim().max(64).nullish(),
  azienda: z.string().trim().max(200).nullish(),
  opzione: z.enum(["standard", "proprieta"]).default("standard"),
  setup: euro.nullish(),
  canone: euro.nullish(),
  ore: z.number().int().min(0).max(5000).nullish(),
  alternativa_proprieta: euro.nullish(),
  validita: giorno.nullish(),
  link_pdf: linkPdf.nullish(),
  // Forbice dell'offerta in euro (modifica 25).
  forbice_da: euro.nullish(),
  forbice_a: euro.nullish(),
  stato: z.enum(["draft", "sent"]),
  sourcePath: z.string().max(500),
}).strict().refine((b) => forbiceValida({ forbiceDaCents: b.forbice_da, forbiceACents: b.forbice_a }), ERRORE_FORBICE);

const cent = z.number().int().min(0).nullable();
export const propostaManualeSchema = z.object({
  leadId: z.string().min(1),
  number: z.string().trim().min(1).max(40),
  option: z.enum(["standard", "proprieta"]).default("standard"),
  setupCents: cent.optional(), feeCents: cent.optional(), hoursEstimate: z.number().int().min(0).nullable().optional(),
  alternativeCents: cent.optional(), validUntil: z.number().int().nullable().optional(), pdfUrl: linkPdf.nullable().optional(),
  status: z.enum(["bozza", "registrata"]),
  ...forbice,
}).strict().refine(forbiceValida, ERRORE_FORBICE);

export const propostaPatchSchema = z.object({
  status: z.enum(PROPOSAL_STATUSES).optional(),
  option: z.enum(["standard", "proprieta"]).optional(),
  setupCents: cent.optional(), feeCents: cent.optional(), alternativeCents: cent.optional(),
  validUntil: z.number().int().nullable().optional(), pdfUrl: linkPdf.nullable().optional(),
  objections: z.string().max(5000).nullable().optional(),
  ...forbice,
}).strict().refine(forbiceValida, ERRORE_FORBICE);

export const abbinaSchema = z.object({ leadId: z.string().min(1) }).strict();
