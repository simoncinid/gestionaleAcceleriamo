import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { dopoCursore, leggiCursore, piuRecente, scriviCursore } from "../lib/cursore";
import { accorcia } from "../lib/testo";

export type VoceDiario = { id: string; at: number; chi: string; testo: string; dettaglio: string | null; area: "commerciale" | "economia" | "automazioni"; href: string | null };

const ETICHETTA_ATTIVITA: Record<string, string> = {
  creazione: "Lead creato", nota: "Nota", chiamata: "Chiamata", email: "Email", cambio_fase: "Cambio di fase", meta: "Lead nuovo da Meta",
  documento: "Documento", cestino: "Lead nel cestino", ripristino: "Lead ripristinato", unione: "Lead uniti", migrazione: "Migrazione",
  esito: "Esito", call: "Call", proposta: "Proposta", foglio: "Lead nuovo dal foglio", ia: "Assistente", email_auto: "Email automatica", contatto: "Contatto",
};
// Solo le modifiche che non hanno già un'attività del lead: soldi, automazioni, clienti, spesa delle campagne.
const ENTITA: Record<string, { nome: string; area: VoceDiario["area"]; href: string }> = {
  fees: { nome: "Canone", area: "economia", href: "/economia/canoni" },
  invoices: { nome: "Fattura", area: "economia", href: "/economia/fatture" },
  costs: { nome: "Costo", area: "economia", href: "/economia/costi" },
  clients: { nome: "Cliente", area: "economia", href: "/commerciale/clienti" },
  automations: { nome: "Automazione", area: "automazioni", href: "/automazioni" },
  campaign_spend: { nome: "Spesa della campagna", area: "commerciale", href: "/commerciale/numeri?vista=campagne" },
};
const AZIONE: Record<string, string> = { create: "creato", update: "modificato", delete: "cancellato", emessa: "emessa", incassata: "incassata", attiva: "attivata", pausa: "in pausa", riprendi: "ripreso", cessa: "cessato", aggiorna: "aggiornata" };

const filtri = z.object({
  chi: z.string().max(60).default("tutti"),
  area: z.enum(["tutte", "commerciale", "economia", "automazioni"]).default("tutte"),
  tipo: z.string().max(40).default("tutti"),
  prima: z.string().max(140).optional(),
});
const PAGINA = 50;

export const diarioRoutes = new Hono<AppEnv>();

diarioRoutes.get("/", async (c) => {
  const f = filtri.safeParse(c.req.query());
  if (!f.success) return c.json({ error: "Filtri non validi" }, 400);
  const { chi, area, tipo, prima } = f.data;
  const cur = leggiCursore(prima);
  if (!cur) return c.json({ error: "Filtri non validi" }, 400);
  const db = c.env.DB;
  const chiAtt = chi === "tutti" ? "" : chi === "sistema" ? "AND a.author_id IS NULL" : "AND a.author_id = ?2";
  const chiAud = chi === "tutti" ? "" : chi === "sistema" ? "AND 0" : "AND u.user_id = ?2";
  const entita = Object.keys(ENTITA).filter((e) => area === "tutte" || ENTITA[e].area === area);
  const conAttivita = (area === "tutte" || area === "commerciale") && (tipo === "tutti" || Object.hasOwn(ETICHETTA_ATTIVITA, tipo));
  const conModifiche = entita.length > 0 && (tipo === "tutti" || tipo === "modifiche");
  // ?1 e ?3 sono il cursore, ?2 la persona (legata sempre, anche quando la query non la usa).
  const legame = [cur.at, chi, cur.id];
  const [att, aud, utenti] = await Promise.all([
    conAttivita
      ? db.prepare(`SELECT a.id, a.type, a.body, a.author_id AS autore, a.created_at AS at, a.lead_id AS leadId, l.company
          FROM activities a JOIN leads l ON l.id = a.lead_id
          WHERE ${dopoCursore("a.created_at", "a.id", "?1", "?3")} ${chiAtt} ${tipo === "tutti" ? "" : `AND a.type = '${tipo}'`}
          ORDER BY a.created_at DESC, a.id DESC LIMIT ${PAGINA}`).bind(...legame).all<{ id: string; type: string; body: string; autore: string | null; at: number; leadId: string; company: string }>()
      : { results: [] },
    conModifiche
      ? db.prepare(`SELECT u.id, u.entity, u.action, u.changes, u.user_id AS autore, u.created_at AS at FROM audit_log u
          WHERE ${dopoCursore("u.created_at", "u.id", "?1", "?3")} ${chiAud} AND u.entity IN (${entita.map((e) => `'${e}'`).join(", ")})
          ORDER BY u.created_at DESC, u.id DESC LIMIT ${PAGINA}`).bind(...legame).all<{ id: string; entity: string; action: string; changes: string | null; autore: string | null; at: number }>()
      : { results: [] },
    db.prepare("SELECT id, name FROM users").all<{ id: string; name: string }>(),
  ]);
  const nome = new Map(utenti.results.map((u) => [u.id, u.name]));
  const voci: VoceDiario[] = [
    ...att.results.map((a): VoceDiario => ({
      id: a.id, at: a.at, area: "commerciale", href: `/commerciale/lead/${a.leadId}`,
      chi: a.type === "ia" ? "Assistente" : a.autore ? nome.get(a.autore) ?? a.autore : "Sistema",
      testo: `${ETICHETTA_ATTIVITA[a.type] ?? a.type}: ${a.company}`,
      dettaglio: a.body ? accorcia(a.body, 140) : null,
    })),
    ...aud.results.map((u): VoceDiario => {
      const e = ENTITA[u.entity];
      const importo = (() => { try { return (JSON.parse(u.changes ?? "{}") as { amountCents?: number }).amountCents ?? null; } catch { return null; } })();
      return {
        id: u.id, at: u.at, area: e.area, href: e.href,
        chi: u.autore ? nome.get(u.autore) ?? u.autore : "Sistema",
        testo: `${e.nome} ${AZIONE[u.action] ?? u.action}`,
        dettaglio: importo == null ? null : `${(importo / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} euro`,
      };
    }),
  ].sort(piuRecente).slice(0, PAGINA);
  return c.json({ voci, prossimo: voci.length === PAGINA ? scriviCursore(voci[PAGINA - 1]) : null });
});
