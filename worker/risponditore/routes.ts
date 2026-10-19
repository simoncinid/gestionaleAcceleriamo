import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, type Db } from "../db/client";
import { igAccount, risorse, risorseRichieste, rispCampagne, rispEventi, type RispCampagna } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { eDemo } from "../lib/demo";
import { linkHttp } from "../leads/validation";
import { igGet } from "./graph";
import { normalizza } from "./parola";
import { salvaToken } from "./token";

export const risponditoreRoutes = new Hono<AppEnv>();

const GIORNO = 86_400_000;
const DURATA_TOKEN = 60 * GIORNO;

// La campagna come la vede la schermata: le risposte pubbliche sono un elenco, non il JSON della colonna.
export type CampagnaRisponditore = Omit<RispCampagna, "rispostepubbliche"> & { rispostePubbliche: string[] };

function perLaSchermata(c: RispCampagna): CampagnaRisponditore {
  const { rispostepubbliche, ...resto } = c;
  let elenco: string[] = [];
  try {
    const v = JSON.parse(rispostepubbliche);
    if (Array.isArray(v)) elenco = v.filter((x): x is string => typeof x === "string");
  } catch {
    elenco = [];
  }
  return { ...resto, rispostePubbliche: elenco };
}

const testo = (max: number, messaggio: string) => z.string().trim().min(1, messaggio).max(max);

const campagnaSchema = z.object({
  nome: testo(120, "Scrivi il nome della campagna"),
  parola: z.string().max(60).transform(normalizza).refine((p) => p.length > 0, "Scrivi la parola da cercare nei commenti"),
  mediaId: z.string().trim().max(60).nullish().transform((v) => v || null),
  rispostePubbliche: z.array(z.string().trim().max(300)).max(10)
    .transform((r) => r.filter(Boolean))
    .refine((r) => r.length > 0, "Serve almeno una risposta pubblica"),
  testoPrivato: testo(1000, "Scrivi il messaggio privato"),
  // Instagram taglia il titolo del pulsante a 20 caratteri.
  etichettaPulsante: z.string().trim().max(20, "Il testo del pulsante sta in 20 caratteri").optional().transform((v) => v || "Mandami il link"),
  risorsaSlug: z.string().trim().min(1, "Scegli la risorsa da mandare"),
  testoLink: testo(1000, "Scrivi il testo che accompagna il link"),
  attiva: z.boolean().default(true),
});
type DatiCampagna = z.output<typeof campagnaSchema>;

// Errore 400 con il primo messaggio di Zod, come il resto dell'app.
async function leggiCampagna(c: { req: { json: () => Promise<unknown> } }) {
  return campagnaSchema.parse(await c.req.json().catch(() => ({})));
}

const risorsaEsiste = async (db: Db, slug: string) => Boolean(await db.select({ slug: risorse.slug }).from(risorse).where(eq(risorse.slug, slug)).get());

// Unica tra le attive dello stesso post (o tra quelle di tutti i post): la parola è già normalizzata.
async function parolaOccupata(db: Db, d: DatiCampagna, escludi?: string) {
  if (!d.attiva) return false;
  const doppia = await db.select({ id: rispCampagne.id }).from(rispCampagne)
    .where(and(
      eq(rispCampagne.attiva, true),
      eq(rispCampagne.parola, d.parola),
      d.mediaId ? eq(rispCampagne.mediaId, d.mediaId) : isNull(rispCampagne.mediaId),
      escludi ? ne(rispCampagne.id, escludi) : undefined,
    )).get();
  return Boolean(doppia);
}

async function controlla(db: Db, d: DatiCampagna, escludi?: string): Promise<{ errore: string; stato: 400 | 409 } | null> {
  if (!(await risorsaEsiste(db, d.risorsaSlug))) return { errore: "La risorsa scelta non esiste", stato: 400 };
  if (await parolaOccupata(db, d, escludi)) return { errore: `La parola "${d.parola}" è già usata da un'altra campagna attiva sullo stesso post`, stato: 409 };
  return null;
}

const colonne = (d: DatiCampagna) => ({
  nome: d.nome, parola: d.parola, mediaId: d.mediaId, rispostepubbliche: JSON.stringify(d.rispostePubbliche),
  testoPrivato: d.testoPrivato, etichettaPulsante: d.etichettaPulsante, risorsaSlug: d.risorsaSlug, testoLink: d.testoLink, attiva: d.attiva,
});

// Tutto quello che serve alla schermata, in una chiamata. Del token esce solo la scadenza: mai il testo né il cifrato.
risponditoreRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const [account, campagne, eventi, richieste, elencoRisorse] = await Promise.all([
    db.select({ username: igAccount.username, scadeIl: igAccount.scadeIl, ultimoErrore: igAccount.ultimoErrore }).from(igAccount).where(eq(igAccount.id, "principale")).get(),
    db.select().from(rispCampagne).orderBy(desc(rispCampagne.creataIl)),
    db.select({
      commentoId: rispEventi.commentoId, mediaId: rispEventi.mediaId, autoreNome: rispEventi.autoreNome, testo: rispEventi.testo,
      campagnaId: rispEventi.campagnaId, parola: rispCampagne.parola, stato: rispEventi.stato, motivo: rispEventi.motivo, creatoIl: rispEventi.creatoIl,
    }).from(rispEventi).leftJoin(rispCampagne, eq(rispCampagne.id, rispEventi.campagnaId)).orderBy(desc(rispEventi.creatoIl)).limit(100),
    db.select({
      id: risorseRichieste.id, nome: risorseRichieste.nome, azienda: risorseRichieste.azienda, telefono: risorseRichieste.telefono,
      slug: risorseRichieste.slug, risorsa: risorse.titolo, creataIl: risorseRichieste.creataIl,
    }).from(risorseRichieste).leftJoin(risorse, eq(risorse.slug, risorseRichieste.slug)).orderBy(desc(risorseRichieste.creataIl)).limit(50),
    db.select({ slug: risorse.slug, titolo: risorse.titolo, attiva: risorse.attiva }).from(risorse).orderBy(risorse.titolo),
  ]);
  return c.json({ account: account ?? null, campagne: campagne.map(perLaSchermata), eventi, richieste, risorse: elencoRisorse });
});

risponditoreRoutes.post("/campagne", async (c) => {
  const d = await leggiCampagna(c);
  const db = getDb(c.env.DB);
  const problema = await controlla(db, d);
  if (problema) return c.json({ error: problema.errore }, problema.stato);
  const riga = { id: crypto.randomUUID(), ...colonne(d), creataIl: Date.now() };
  await db.insert(rispCampagne).values(riga);
  await audit(db, c.get("user").id, "risp_campagne", riga.id, "create", { nome: d.nome, parola: d.parola });
  return c.json({ campagna: perLaSchermata(riga) }, 201);
});

risponditoreRoutes.put("/campagne/:id", async (c) => {
  const id = c.req.param("id");
  const d = await leggiCampagna(c);
  const db = getDb(c.env.DB);
  const esiste = await db.select({ id: rispCampagne.id }).from(rispCampagne).where(eq(rispCampagne.id, id)).get();
  if (!esiste) return c.json({ error: "Campagna non trovata" }, 404);
  const problema = await controlla(db, d, id);
  if (problema) return c.json({ error: problema.errore }, problema.stato);
  const [riga] = await db.update(rispCampagne).set(colonne(d)).where(eq(rispCampagne.id, id)).returning();
  await audit(db, c.get("user").id, "risp_campagne", id, "update", { nome: d.nome, parola: d.parola, attiva: d.attiva });
  return c.json({ campagna: perLaSchermata(riga!) });
});

// Collega l'account: Instagram conferma chi è il token, poi lo si salva cifrato. Nello spazio demo niente servizi veri.
risponditoreRoutes.post("/account", async (c) => {
  if (eDemo(c.env)) return c.json({ error: "Nello spazio demo l'account Instagram non si collega" }, 409);
  const { token } = z.object({ token: testo(1000, "Incolla il token di Instagram") }).parse(await c.req.json().catch(() => ({})));
  const me = await igGet(c.env, token, "me?fields=user_id,username");
  if (!me.ok || !me.dati?.username) return c.json({ error: `Instagram non accetta questo token: ${me.ok ? "risposta senza nome utente" : me.messaggio}` }, 400);
  const now = Date.now();
  const scadeIl = now + DURATA_TOKEN;
  try {
    await salvaToken(c.env, { igUserId: String(me.dati.user_id ?? me.dati.id ?? ""), username: String(me.dati.username), token, scadeIl }, now);
  } catch {
    return c.json({ error: "Manca la chiave per cifrare il token: la mette chi gestisce il server" }, 409);
  }
  await audit(getDb(c.env.DB), c.get("user").id, "ig_account", "principale", "collega", { username: me.dati.username });
  return c.json({ account: { username: String(me.dati.username), scadeIl, ultimoErrore: null } });
});

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const risorsaSchema = z.object({
  titolo: testo(200, "Scrivi il titolo della risorsa"),
  sottotitolo: z.string().trim().max(300).default(""),
  corpo: z.string().trim().max(20_000).default(""),
  pdfUrl: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), linkHttp("Link del PDF non valido").pipe(z.string().max(500)).nullish()),
  attiva: z.boolean().default(true),
});

// Crea o modifica una risorsa: lo slug è l'indirizzo della pagina pubblica /r/<slug>, in minuscolo con i trattini.
risponditoreRoutes.put("/risorse/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!SLUG.test(slug) || slug.length > 80) return c.json({ error: "L'indirizzo della risorsa va in minuscolo, con i trattini tra le parole" }, 400);
  const d = risorsaSchema.parse(await c.req.json().catch(() => ({})));
  const db = getDb(c.env.DB);
  const valori = { titolo: d.titolo, sottotitolo: d.sottotitolo, corpo: d.corpo, pdfUrl: d.pdfUrl ?? null, attiva: d.attiva };
  await db.insert(risorse).values({ slug, ...valori, creataIl: Date.now() }).onConflictDoUpdate({ target: risorse.slug, set: valori });
  await audit(db, c.get("user").id, "risorse", slug, "salva", { titolo: d.titolo });
  return c.json({ risorsa: { slug, ...valori } });
});
