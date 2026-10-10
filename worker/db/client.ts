import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export const getDb = (d1: D1Database) => drizzle(d1, { schema });
export type Db = ReturnType<typeof getDb>;

// Vincolo unico violato: drizzle avvolge l'errore di D1, il testo vero sta in cause.
export const violaUnico = (err: unknown) => /UNIQUE/.test(`${String(err)} ${String((err as { cause?: unknown } | null)?.cause ?? "")}`);
