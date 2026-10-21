import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, type Db } from "../db/client";
import { automations, clients, statoGiri, statoVoci, type EsitoStato, type StatoVoce } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { coloreVoce, prossimoGiro, type Colore } from "./calcoli";
import { improntaChiave, intervalloVoce, nomeVoce, nuovaChiave, registraBattito } from "./service";
import { idVoceGiro, VOCE_GIRO, VOCE_WEBHOOK_META, VOCI_GIRO } from "./voci";
import type { Lavoro } from "../cron";

export type VoceStato = {
  id: string; tipo: "interno" | "esterno"; nome: string; proprietario: string; clientId: string | null;
  automationId: string | null; automazione: string | null; intervalloMin: number | null; attiva: boolean; colore: Colore;
  ultimoEsito: EsitoStato | null; ultimoGiroAt: number | null; ultimoOkAt: number | null; ultimoErroreAt: number | null;
  ultimoErrore: string | null; ultimoPasso: string | null; prossimoAt: number | null;
};
export type GiroStato = { id: number; esito: EsitoStato; at: number; messaggio: string | null; passo: string | null };

const ULTIMI_GIRI = 20;
const ORDINE: Record<Colore, number> = { rosso: 0, giallo: 1, verde: 2, grigio: 3 };

async function elenco(db: Db, now: number): Promise<VoceStato[]> {
  const righe = await db.select({ v: statoVoci, cliente: clients.name, automazione: automations.name }).from(statoVoci)
    .leftJoin(clients, eq(clients.id, statoVoci.clientId))
    .leftJoin(automations, eq(automations.id, statoVoci.automationId))
    .where(isNull(statoVoci.eliminataIl));
  // I lavori del giro compaiono anche prima del loro primo giro, grigi ("mai partita").
  const presenti = new Set(righe.map((r) => r.v.id));
  const mancanti = [VOCE_GIRO, VOCE_WEBHOOK_META, ...(Object.keys(VOCI_GIRO) as Lavoro[]).map(idVoceGiro)].filter((id) => !presenti.has(id)).map((id) => ({
    v: { id, tipo: "interno", nome: null, clientId: null, automationId: null, intervalloMin: null, chiaveImpronta: null, attiva: true, ultimoEsito: null,
      ultimoGiroAt: null, ultimoOkAt: null, ultimoErroreAt: null, ultimoErrore: null, ultimoPasso: null, creataIl: null, eliminataIl: null } as StatoVoce,
    cliente: null, automazione: null,
  }));
  return [...righe, ...mancanti].map(({ v, cliente, automazione }) => {
    const calcolo = { attiva: v.attiva, intervalloMin: intervalloVoce(v), ultimoEsito: v.ultimoEsito, ultimoGiroAt: v.ultimoGiroAt };
    return {
      id: v.id, tipo: v.tipo, nome: nomeVoce(v), proprietario: cliente ?? "Acceleriamo", clientId: v.clientId, automationId: v.automationId,
      automazione, intervalloMin: calcolo.intervalloMin, attiva: v.attiva, colore: coloreVoce(calcolo, now), ultimoEsito: v.ultimoEsito,
      ultimoGiroAt: v.ultimoGiroAt, ultimoOkAt: v.ultimoOkAt, ultimoErroreAt: v.ultimoErroreAt, ultimoErrore: v.ultimoErrore,
      ultimoPasso: v.ultimoPasso, prossimoAt: prossimoGiro(calcolo),
    };
  }).sort((a, b) => ORDINE[a.colore] - ORDINE[b.colore] || (a.tipo === b.tipo ? 0 : a.tipo === "esterno" ? -1 : 1) || a.nome.localeCompare(b.nome, "it"));
}

const campi = {
  nome: z.string().trim().min(1, "Dai un nome all'automazione").max(120),
  clientId: z.string().min(1).nullish(),
  automationId: z.string().min(1).nullish(),
  intervalloMin: z.number().int().min(1, "L'intervallo è almeno 1 minuto").max(44_640, "L'intervallo è al massimo un mese"),
};

async function controllaLegami(db: Db, b: { clientId?: string | null; automationId?: string | null }) {
  if (b.clientId && !(await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, b.clientId), isNull(clients.deletedAt))).get())) return "Cliente inesistente";
  if (b.automationId && !(await db.select({ id: automations.id }).from(automations).where(and(eq(automations.id, b.automationId), isNull(automations.deletedAt))).get())) return "Automazione inesistente";
  return null;
}

const esterna = (db: Db, id: string) => db.select().from(statoVoci).where(and(eq(statoVoci.id, id), eq(statoVoci.tipo, "esterno"), isNull(statoVoci.eliminataIl))).get();

export const statoRoutes = new Hono<AppEnv>();

// Battito delle automazioni esterne (pubblico, fuori dalla sessione): la chiave nell'intestazione Authorization.
const BATTITO = z.object({
  esito: z.enum(["ok", "errore"]),
  messaggio: z.string().max(2000).nullish(),
  passo: z.string().max(500).nullish(),
});
statoRoutes.post("/battito", async (c) => {
  const chiave = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
  if (!chiave) return c.json({ error: "Chiave mancante" }, 401);
  const b = BATTITO.parse(await c.req.json().catch(() => ({})));
  const voce = await registraBattito(getDb(c.env.DB), chiave, b, Date.now());
  if (!voce) return c.json({ error: "Chiave non valida" }, 401);
  return c.json({ ok: true });
});

statoRoutes.get("/", async (c) => c.json({ voci: await elenco(getDb(c.env.DB), Date.now()) }));

statoRoutes.get("/:id/giri", async (c) => {
  const giri = await getDb(c.env.DB).select({ id: statoGiri.id, esito: statoGiri.esito, at: statoGiri.at, messaggio: statoGiri.messaggio, passo: statoGiri.passo })
    .from(statoGiri).where(eq(statoGiri.voceId, c.req.param("id"))).orderBy(desc(statoGiri.at), desc(statoGiri.id)).limit(ULTIMI_GIRI);
  return c.json({ giri });
});

// Nuova automazione esterna: la chiave si mostra solo in questa risposta, nel database resta l'impronta.
statoRoutes.post("/voci", async (c) => {
  const db = getDb(c.env.DB);
  const b = z.object(campi).strict().parse(await c.req.json());
  const errore = await controllaLegami(db, b);
  if (errore) return c.json({ error: errore }, 404);
  const chiave = nuovaChiave();
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.insert(statoVoci).values({ id, tipo: "esterno", nome: b.nome, clientId: b.clientId ?? null, automationId: b.automationId ?? null,
    intervalloMin: b.intervalloMin, chiaveImpronta: await improntaChiave(chiave), attiva: true, creataIl: now });
  await audit(db, c.get("user").id, "stato_voci", id, "create", { nome: b.nome, intervalloMin: b.intervalloMin });
  return c.json({ id, chiave }, 201);
});

statoRoutes.patch("/voci/:id", async (c) => {
  const db = getDb(c.env.DB);
  const b = z.object({ ...campi, attiva: z.boolean() }).partial().strict().parse(await c.req.json());
  if (!(await esterna(db, c.req.param("id")))) return c.json({ error: "Automazione non trovata" }, 404);
  const errore = await controllaLegami(db, b);
  if (errore) return c.json({ error: errore }, 404);
  await db.update(statoVoci).set(b).where(eq(statoVoci.id, c.req.param("id")));
  await audit(db, c.get("user").id, "stato_voci", c.req.param("id"), "update", b);
  return c.json({ ok: true });
});

// Chiave nuova (la vecchia smette subito di valere): per una chiave persa o finita dove non doveva.
statoRoutes.post("/voci/:id/chiave", async (c) => {
  const db = getDb(c.env.DB);
  if (!(await esterna(db, c.req.param("id")))) return c.json({ error: "Automazione non trovata" }, 404);
  const chiave = nuovaChiave();
  await db.update(statoVoci).set({ chiaveImpronta: await improntaChiave(chiave) }).where(eq(statoVoci.id, c.req.param("id")));
  await audit(db, c.get("user").id, "stato_voci", c.req.param("id"), "chiave", {});
  return c.json({ chiave });
});

statoRoutes.delete("/voci/:id", async (c) => {
  const db = getDb(c.env.DB);
  if (!(await esterna(db, c.req.param("id")))) return c.json({ error: "Automazione non trovata" }, 404);
  await db.update(statoVoci).set({ eliminataIl: Date.now(), chiaveImpronta: null }).where(eq(statoVoci.id, c.req.param("id")));
  await audit(db, c.get("user").id, "stato_voci", c.req.param("id"), "delete", {});
  return c.json({ ok: true });
});

