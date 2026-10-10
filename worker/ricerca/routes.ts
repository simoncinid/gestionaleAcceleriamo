import { Hono } from "hono";
import type { AppEnv } from "../env";

export type RisultatoCerca = { id: string; titolo: string; meta: string | null; href: string };
export type RispostaCerca = { lead: RisultatoCerca[]; proposte: RisultatoCerca[]; automazioni: RisultatoCerca[]; fatture: RisultatoCerca[] };
type Trovato = Omit<RisultatoCerca, "href">;

// "%" e "_" sono caratteri normali: si scappano con "\" (ESCAPE '\').
const comeTesto = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const VUOTA: RispostaCerca = { lead: [], proposte: [], automazioni: [], fatture: [] };

export const ricercaRoutes = new Hono<AppEnv>();

// Spec 5.2: una sola ricerca per tutta l'app (lente, Cmd K, "/"). 4 query, 5 risultati per gruppo.
ricercaRoutes.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return c.json(VUOTA);
  const p = comeTesto(q);
  const db = c.env.DB;
  const [lead, proposte, automazioni, fatture] = await Promise.all([
    db.prepare(`SELECT l.id, l.company AS titolo, s.label AS meta FROM leads l JOIN stages s ON s.id = l.stage_id
      WHERE l.deleted_at IS NULL AND (l.company LIKE ?1 ESCAPE '\\' OR l.contact_name LIKE ?1 ESCAPE '\\' OR l.email LIKE ?1 ESCAPE '\\') ORDER BY l.updated_at DESC LIMIT 5`).bind(p).all<Trovato>(),
    db.prepare(`SELECT id, number AS titolo, company AS meta FROM proposals WHERE deleted_at IS NULL AND (number LIKE ?1 ESCAPE '\\' OR company LIKE ?1 ESCAPE '\\') ORDER BY created_at DESC LIMIT 5`).bind(p).all<Trovato>(),
    db.prepare(`SELECT a.id, a.name AS titolo, c.name AS meta FROM automations a JOIN clients c ON c.id = a.client_id WHERE a.deleted_at IS NULL AND (a.name LIKE ?1 ESCAPE '\\' OR c.name LIKE ?1 ESCAPE '\\') ORDER BY a.updated_at DESC LIMIT 5`).bind(p).all<Trovato>(),
    db.prepare(`SELECT i.id, 'Fattura ' || COALESCE(i.number, 'senza numero') AS titolo, c.name AS meta FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.deleted_at IS NULL AND (i.number LIKE ?1 ESCAPE '\\' OR c.name LIKE ?1 ESCAPE '\\') ORDER BY i.issued_at DESC LIMIT 5`).bind(p).all<Trovato>(),
  ]);
  const con = (r: { results: Trovato[] }, href: (x: Trovato) => string) => r.results.map((x) => ({ ...x, href: href(x) }));
  const out: RispostaCerca = {
    lead: con(lead, (x) => `/commerciale/lead/${x.id}`),
    proposte: con(proposte, (x) => `/commerciale/proposte/${x.id}`),
    automazioni: con(automazioni, (x) => `/automazioni/${x.id}`),
    fatture: con(fatture, () => "/economia/fatture"),
  };
  return c.json(out);
});
