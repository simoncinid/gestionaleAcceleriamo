import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { risorse, risorseRichieste } from "../db/schema";
import { avvisa } from "../avvisi/service";

// Rotte senza sessione: pagine risorsa aperte a chiunque abbia il link. Non toccano mai la tabella dei lead.
export const risorsePubbliche = new Hono<AppEnv>();

const NON_TROVATA = "Risorsa non trovata";

async function trovaAttiva(c: { env: AppEnv["Bindings"] }, slug: string) {
  const [r] = await getDb(c.env.DB).select().from(risorse).where(eq(risorse.slug, slug)).limit(1);
  return r?.attiva ? r : null;
}

risorsePubbliche.get("/:slug", async (c) => {
  const r = await trovaAttiva(c, c.req.param("slug"));
  if (!r) return c.json({ error: NON_TROVATA }, 404);
  return c.json({ titolo: r.titolo, sottotitolo: r.sottotitolo, corpo: r.corpo, pdfUrl: r.pdfUrl });
});

const testo = (v: unknown) => (typeof v === "string" ? v.trim() : "");

risorsePubbliche.post("/:slug/richiesta", async (c) => {
  const r = await trovaAttiva(c, c.req.param("slug"));
  if (!r) return c.json({ error: NON_TROVATA }, 404);
  const corpo = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo || typeof corpo !== "object") throw new HTTPException(400, { message: "Richiesta non valida" });
  // Campo trappola: i visitatori veri non lo vedono, i robot lo riempiono. Finta riuscita, niente salvato.
  if (testo(corpo.sito)) return c.body(null, 204);

  const nome = testo(corpo.nome);
  const azienda = testo(corpo.azienda);
  const telefono = testo(corpo.telefono);
  const messaggio = testo(corpo.messaggio);
  if (!nome) throw new HTTPException(400, { message: "Scrivi il tuo nome" });
  if (nome.length > 120) throw new HTTPException(400, { message: "Il nome è troppo lungo (massimo 120 caratteri)" });
  if (!azienda) throw new HTTPException(400, { message: "Scrivi il nome della tua azienda" });
  if (azienda.length > 120) throw new HTTPException(400, { message: "Il nome dell'azienda è troppo lungo (massimo 120 caratteri)" });
  if (!telefono) throw new HTTPException(400, { message: "Scrivi il tuo numero di telefono" });
  if (telefono.length > 30 || telefono.replace(/\D/g, "").length < 6) {
    throw new HTTPException(400, { message: "Controlla il numero di telefono: servono almeno 6 cifre" });
  }
  if (messaggio.length > 1000) throw new HTTPException(400, { message: "Il messaggio è troppo lungo (massimo 1000 caratteri)" });

  // Spazio demo: risponde come se fosse andata bene, ma non scrive e non avvisa nessuno.
  if (c.env.SPAZIO === "demo") return c.body(null, 204);

  const db = getDb(c.env.DB);
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.insert(risorseRichieste).values({ id, slug: r.slug, nome, azienda, telefono, messaggio: messaggio || null, creataIl: now });
  await avvisa(db, {
    evento: "risorsa_richiesta",
    entityId: id,
    titolo: "Richiesta di chiamata da una pagina risorsa",
    testo: `${nome} (${azienda}) chiede di essere richiamato al ${telefono}.`,
    href: "/automazioni/risponditore",
  }, now);
  return c.body(null, 204);
});
