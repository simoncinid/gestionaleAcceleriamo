import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db/client";
import type { AppEnv } from "../env";
import { AZIENDA_SQL, aziendaNorm } from "../lib/azienda";
import { FINE, dopoCursore, leggiCursore, scriviCursore } from "../lib/cursore";
import { DEFAULT_NEXT_ACTION, firstOpenStage } from "../leads/service";
import { normalizeEmail, normalizePhone } from "../lib/normalize";
import { cellaCsv, colonneImport, leggiCsv } from "./csv";

export type RigaImport = { riga: number; company: string; contactName: string | null; email: string | null; phone: string | null; website: string | null; notes: string | null; esito: "nuovo" | "doppione" | "errore"; motivo: string | null };
export type AnteprimaImport = { righe: RigaImport[]; nuovi: number; doppioni: number; errori: number };
export type VoceAudit = { id: string; at: number; chi: string; entita: string; azione: string; entityId: string };
export type RiepilogoDati = { cestino: number; ultimaModifica: number | null; demoUrl: string | null };

const MAX_ANTEPRIMA = 500;
// 20 righe: 2 scritture a riga (lead e attività) più 4 query fisse, sotto le 50 query del piano gratuito.
const MAX_BLOCCO = 20;
const BLOCCO_QUERY = 45; // D1 accetta 100 parametri per query: 45 email più 45 telefoni
const PAGINA_AUDIT = 50;

// Un solo schema dei campi per anteprima e import: stessi limiti, stessi messaggi.
// Una riga che li supera è "errore" in anteprima e un 400 con riga e motivo all'import.
const testo = (max: number, messaggio: string) => z.string().max(max, messaggio).nullable();
const campiRiga = z.object({
  company: z.string().max(200, "Azienda troppo lunga: al massimo 200 caratteri"),
  contactName: testo(200, "Referente troppo lungo: al massimo 200 caratteri"),
  email: testo(200, "Email troppo lunga: al massimo 200 caratteri"),
  phone: testo(50, "Telefono troppo lungo: al massimo 50 caratteri"),
  website: testo(300, "Sito troppo lungo: al massimo 300 caratteri"),
  notes: testo(2000, "Note troppo lunghe: al massimo 2000 caratteri"),
});
const rigaImport = campiRiga.extend({ riga: z.number().int().min(1).max(100_000), esito: z.enum(["nuovo", "doppione", "errore"]), motivo: z.string().max(300).nullable() });
// Solo i messaggi dei limiti sono scritti per l'utente; gli altri (tipi sbagliati) diventano una frase sola.
const messaggio = (e: z.ZodError) => (e.issues[0]?.code === "too_big" ? e.issues[0].message : "valori non validi");
const motivoCampi = (r: unknown) => {
  const p = campiRiga.safeParse(r);
  return p.success ? null : messaggio(p.error);
};

type PerDoppioni = { company: string; email: string | null; phone: string | null };
const soloAzienda = (r: PerDoppioni) => !normalizeEmail(r.email) && !normalizePhone(r.phone) && !!r.company.trim();

// Doppioni con il database: una query ogni 45 righe (al massimo 12 per 500 righe), più una per blocco
// solo se ci sono righe con la sola azienda. Sempre sotto le 50 della richiesta.
async function giaPresenti(db: D1Database, righe: PerDoppioni[]) {
  const email = new Set<string>();
  const tel = new Set<string>();
  const aziende = new Set<string>();
  const segnaposti = (n: number, da: number) => Array.from({ length: n }, (_, k) => `?${da + k}`).join(", ") || "NULL";
  for (let i = 0; i < righe.length; i += BLOCCO_QUERY) {
    const pezzo = righe.slice(i, i + BLOCCO_QUERY);
    const e = pezzo.map((r) => normalizeEmail(r.email)).filter((x): x is string => !!x);
    const t = pezzo.map((r) => normalizePhone(r.phone)).filter((x): x is string => !!x);
    if (e.length || t.length) {
      const r = await db.prepare(`SELECT email_norm AS e, phone_norm AS t FROM leads WHERE deleted_at IS NULL AND (email_norm IN (${segnaposti(e.length, 1)}) OR phone_norm IN (${segnaposti(t.length, e.length + 1)}))`)
        .bind(...e, ...t).all<{ e: string | null; t: string | null }>();
      for (const x of r.results) { if (x.e) email.add(x.e); if (x.t) tel.add(x.t); }
    }
    const a = [...new Set(pezzo.filter(soloAzienda).map((r) => aziendaNorm(r.company)))];
    if (a.length) {
      const r = await db.prepare(`SELECT ${AZIENDA_SQL} AS a FROM leads WHERE deleted_at IS NULL AND ${AZIENDA_SQL} IN (${segnaposti(a.length, 1)})`)
        .bind(...a).all<{ a: string }>();
      for (const x of r.results) aziende.add(aziendaNorm(x.a));
    }
  }
  return { email, tel, aziende };
}

async function valuta(db: D1Database, righe: Omit<RigaImport, "esito" | "motivo">[]): Promise<RigaImport[]> {
  const valide = righe.filter((r) => r.company.trim() && !motivoCampi(r));
  const presenti = await giaPresenti(db, valide);
  const visteE = new Set<string>();
  const visteT = new Set<string>();
  const visteA = new Set<string>();
  return righe.map((r): RigaImport => {
    if (!r.company.trim()) return { ...r, esito: "errore", motivo: "Manca l'azienda" };
    const problema = motivoCampi(r);
    if (problema) return { ...r, esito: "errore", motivo: problema };
    const e = normalizeEmail(r.email);
    const t = normalizePhone(r.phone);
    const a = soloAzienda(r) ? aziendaNorm(r.company) : null;
    if ((e && presenti.email.has(e)) || (t && presenti.tel.has(t))) return { ...r, esito: "doppione", motivo: "C'è già un lead con la stessa email o lo stesso telefono" };
    if (a && presenti.aziende.has(a)) return { ...r, esito: "doppione", motivo: "C'è già un lead con la stessa azienda" };
    if ((e && visteE.has(e)) || (t && visteT.has(t)) || (a && visteA.has(a))) return { ...r, esito: "doppione", motivo: "Ripetuto nel file" };
    if (e) visteE.add(e);
    if (t) visteT.add(t);
    if (a) visteA.add(a);
    return { ...r, esito: "nuovo", motivo: null };
  });
}

export const datiRoutes = new Hono<AppEnv>();

// Spec 11.6: import con anteprima. I lead importati sono vecchi: niente email di conferma, niente catena del lead nuovo.
datiRoutes.post("/import/leads", async (c) => {
  const corpo = await c.req.json().catch(() => null);
  if (c.req.query("anteprima") === "1") {
    const p = z.object({ csv: z.string().min(1).max(500_000) }).safeParse(corpo);
    if (!p.success) return c.json({ error: "Carica un file CSV (al massimo 500 KB)" }, 400);
    const [testa, ...dati] = leggiCsv(p.data.csv);
    if (!testa) return c.json({ error: "Il file è vuoto" }, 400);
    if (dati.length > MAX_ANTEPRIMA) return c.json({ error: `Al massimo ${MAX_ANTEPRIMA} righe per file` }, 400);
    const col = colonneImport(testa);
    if (col.company === undefined) return c.json({ error: "Manca la colonna dell'azienda (Azienda o Ragione sociale)" }, 400);
    const v = (r: string[], k: keyof typeof col) => (col[k] === undefined ? null : r[col[k]!]?.trim() || null);
    const righe = await valuta(c.env.DB, dati.map((r, i) => ({
      riga: i + 2, company: v(r, "company") ?? "", contactName: v(r, "contactName"), email: v(r, "email"), phone: v(r, "phone"), website: v(r, "website"), notes: v(r, "notes"),
    })));
    const out: AnteprimaImport = { righe, nuovi: righe.filter((r) => r.esito === "nuovo").length, doppioni: righe.filter((r) => r.esito === "doppione").length, errori: righe.filter((r) => r.esito === "errore").length };
    return c.json(out);
  }
  // Due errori distinti: troppe righe nella chiamata, oppure una riga che non rispetta i limiti (con il suo numero).
  const blocco = z.object({ righe: z.array(z.unknown()) }).safeParse(corpo);
  if (!blocco.success) return c.json({ error: "Manda le righe dell'anteprima" }, 400);
  if (blocco.data.righe.length > MAX_BLOCCO) return c.json({ error: `Al massimo ${MAX_BLOCCO} righe per volta` }, 400);
  const righe: z.infer<typeof rigaImport>[] = [];
  for (const grezza of blocco.data.righe) {
    const r = rigaImport.safeParse(grezza);
    if (r.success) { righe.push(r.data); continue; }
    const n = (grezza as { riga?: unknown } | null)?.riga;
    const quale = typeof n === "number" && Number.isInteger(n) ? `Riga ${n}` : "Una riga";
    return c.json({ error: `${quale}: ${messaggio(r.error)}` }, 400);
  }
  // Il server ricontrolla: l'esito mandato dalla pagina non fa testo.
  const valutate = await valuta(c.env.DB, righe);
  const nuove = valutate.filter((r) => r.esito === "nuovo");
  if (!nuove.length) return c.json({ creati: 0, saltati: valutate.length });
  const now = Date.now();
  const chi = c.get("user").id;
  const fase = await firstOpenStage(getDb(c.env.DB));
  const ids = nuove.map(() => crypto.randomUUID());
  const istruzioni = nuove.map((r, i) =>
    c.env.DB.prepare(`INSERT INTO leads (id, company, contact_name, email, email_norm, phone, phone_norm, website, notes, source, stage_id, stage_changed_at, next_action, next_action_at, created_by, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'manuale', ?10, ?11, ?12, ?11, ?13, ?11, ?11)`)
      .bind(ids[i], r.company.trim(), r.contactName, r.email, normalizeEmail(r.email), r.phone, normalizePhone(r.phone), r.website, r.notes, fase.id, now, DEFAULT_NEXT_ACTION, chi));
  // Le voci "Importato da CSV" in un'istruzione sola (3 parametri a riga più 2, al massimo 62 dei 100 di D1):
  // il blocco da 20 righe resta lontano dal tetto delle 50 query anche nel caso misto.
  const n = nuove.length;
  istruzioni.push(c.env.DB.prepare(`INSERT INTO activities (id, lead_id, type, body, author_id, created_at) VALUES
      ${nuove.map((_, i) => `(?${3 * i + 1}, ?${3 * i + 2}, 'migrazione', ?${3 * i + 3}, ?${3 * n + 1}, ?${3 * n + 2})`).join(", ")}`)
    .bind(...nuove.flatMap((r, i) => [crypto.randomUUID(), ids[i], `Importato da CSV (riga ${r.riga})`]), chi, now));
  istruzioni.push(c.env.DB.prepare("INSERT INTO audit_log (id, user_id, entity, entity_id, action, created_at) VALUES (?1, ?2, 'import', 'csv', ?3, ?4)")
    .bind(crypto.randomUUID(), chi, `importa ${nuove.length} lead`, now));
  await c.env.DB.batch(istruzioni);
  return c.json({ creati: nuove.length, saltati: valutate.length - nuove.length });
});

const ESPORTAZIONI: Record<string, { file: string; sql: string; intestazione: string[] }> = {
  leads: {
    file: "lead",
    sql: `SELECT l.id, l.company, l.contact_name, l.email, l.phone, l.source, s.label, l.meta_campaign, l.setup_cents, l.fee_cents, l.created_at
      FROM leads l JOIN stages s ON s.id = l.stage_id WHERE l.deleted_at IS NULL ORDER BY l.created_at`,
    intestazione: ["id", "azienda", "referente", "email", "telefono", "fonte", "fase", "campagna", "setup (centesimi)", "canone (centesimi)", "creato il"],
  },
  proposte: {
    file: "proposte",
    sql: `SELECT number, company, option, setup_cents, fee_cents, status, sent_at, presented_at, decided_at FROM proposals WHERE deleted_at IS NULL ORDER BY created_at`,
    intestazione: ["numero", "azienda", "opzione", "setup (centesimi)", "canone (centesimi)", "stato", "mandata il", "presentata il", "decisa il"],
  },
  fatture: {
    file: "fatture",
    sql: `SELECT i.number, c.name, i.kind, i.amount_cents, i.period, i.issued_at, i.due_at, i.paid_at FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.deleted_at IS NULL ORDER BY i.issued_at`,
    intestazione: ["numero", "cliente", "tipo", "importo (centesimi)", "periodo", "emessa il", "scadenza", "incassata il"],
  },
};
const COLONNE_DATA = /_at$/;
const dataIso = (ms: unknown) => (typeof ms === "number" ? new Date(ms).toISOString().slice(0, 10) : ms);

// Punto e virgola (Excel italiano), BOM per gli accenti, celle protette dalle formule. Ogni scaricamento va nel registro.
datiRoutes.get("/export/:tipo", async (c) => {
  const tipo = c.req.param("tipo");
  const e = Object.hasOwn(ESPORTAZIONI, tipo) ? ESPORTAZIONI[tipo] : undefined;
  if (!e) return c.json({ error: "Esportazione sconosciuta" }, 404);
  const r = await c.env.DB.prepare(e.sql).all<Record<string, unknown>>();
  const righe = r.results.map((x) => Object.entries(x).map(([k, v]) => cellaCsv(COLONNE_DATA.test(k) ? dataIso(v) : v)).join(";"));
  const oggi = new Date().toISOString().slice(0, 10);
  await c.env.DB.prepare("INSERT INTO audit_log (id, user_id, entity, entity_id, action, created_at) VALUES (?1, ?2, 'export', ?3, 'scarica', ?4)").bind(crypto.randomUUID(), c.get("user").id, tipo, Date.now()).run();
  return new Response(`﻿${[e.intestazione.join(";"), ...righe].join("\n")}\n`, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${e.file}-${oggi}.csv"`, "cache-control": "no-store" },
  });
});

datiRoutes.get("/audit", async (c) => {
  const cur = leggiCursore(c.req.query("prima")) ?? FINE;
  const r = await c.env.DB.prepare(`SELECT a.id, a.created_at AS at, COALESCE(u.name, 'Sistema') AS chi, a.entity AS entita, a.action AS azione, a.entity_id AS entityId
    FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE ${dopoCursore("a.created_at", "a.id", "?1", "?2")}
    ORDER BY a.created_at DESC, a.id DESC LIMIT ${PAGINA_AUDIT}`).bind(cur.at, cur.id)
    .all<VoceAudit>();
  return c.json({ voci: r.results, prossimo: r.results.length === PAGINA_AUDIT ? scriviCursore(r.results[PAGINA_AUDIT - 1]) : null });
});

datiRoutes.get("/dati/riepilogo", async (c) => {
  const [cestino, ultima] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE deleted_at IS NOT NULL").first<{ n: number }>(),
    c.env.DB.prepare("SELECT MAX(created_at) AS at FROM audit_log").first<{ at: number | null }>(),
  ]);
  const out: RiepilogoDati = { cestino: cestino?.n ?? 0, ultimaModifica: ultima?.at ?? null, demoUrl: c.env.DEMO_URL || null };
  return c.json(out);
});
