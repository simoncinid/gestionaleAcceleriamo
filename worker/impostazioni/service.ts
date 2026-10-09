import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/client";
import { settings, stageRules } from "../db/schema";
import { audit } from "../lib/audit";
import { CONTESTO_BASE, type Contesto } from "../regole/motore";
import { IMPOSTAZIONI_DEFAULT, SCHEMI, type Impostazioni } from "./default";

const eChiave = (k: string): k is keyof Impostazioni => Object.prototype.hasOwnProperty.call(SCHEMI, k);

// Una chiave senza riga, o con un valore che non passa lo schema, vale il default:
// un'impostazione rovinata non deve fermare l'applicazione.
export async function leggiImpostazioni(db: Db): Promise<Impostazioni> {
  const righe = await db.select().from(settings);
  const out = structuredClone(IMPOSTAZIONI_DEFAULT) as Record<string, unknown>;
  for (const r of righe) {
    if (!eChiave(r.key)) continue;
    let grezzo: unknown;
    try {
      grezzo = JSON.parse(r.value);
    } catch {
      console.error("impostazione_illeggibile", r.key);
      continue;
    }
    const valido = SCHEMI[r.key].safeParse(grezzo);
    if (valido.success) out[r.key] = valido.data;
    else console.error("impostazione_non_valida", r.key);
  }
  return out as Impostazioni;
}

export async function salvaImpostazione(db: Db, key: string, value: unknown, userId: string, now = Date.now()): Promise<void> {
  if (!eChiave(key)) throw new HTTPException(400, { message: "Impostazione sconosciuta" });
  const valido = SCHEMI[key].parse(value);
  const testo = JSON.stringify(valido);
  await db
    .insert(settings)
    .values({ key, value: testo, updatedBy: userId, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: testo, updatedBy: userId, updatedAt: now } });
  await audit(db, userId, "settings", key, "update", valido, now);
}

// Parametri del motore letti da Impostazioni e da stage_rules.
// I parametri sono validati al salvataggio (ricontatti con almeno un giorno): il motore non riceve mai una lista vuota.
export async function contestoRegole(db: Db, ora: number): Promise<Contesto> {
  const imp = await leggiImpostazioni(db);
  const regole = await db.select().from(stageRules).where(eq(stageRules.active, true));
  const p = (k: string) => {
    try {
      return JSON.parse(regole.find((r) => r.ruleKey === k)?.params ?? "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const giorni = p("ricontatti").giorni;
  return {
    ...CONTESTO_BASE,
    ora,
    orario: imp.orario,
    sequenze: imp.sequenze.attive,
    ricontatti: Array.isArray(giorni) && giorni.length > 0 ? (giorni as number[]) : CONTESTO_BASE.ricontatti,
    pausaMesi: (p("pausa").mesi as number | undefined) ?? CONTESTO_BASE.pausaMesi,
    oreProposta: (p("preventivo_48h").ore as number | undefined) ?? CONTESTO_BASE.oreProposta,
    massimoTentativi: (p("tentativi").massimo as number | undefined) ?? CONTESTO_BASE.massimoTentativi,
  };
}
