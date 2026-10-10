import { getDb } from "../db/client";
import type { Env } from "../env";
import { giornoRoma, inizioGiornoRoma, meseRoma } from "../lib/roma";
import { finePausa } from "../regole/motore";
import { FASE_PRIMA_CHIAMATA, leggiSla, scadenzaPrimaChiamata } from "../regole/sla";
import { avvisa, chiaveAvviso, destinatari, type NuovoAvviso } from "./service";

const MINUTI_PREAVVISO = 30; // spec 8: a 90 minuti con lo SLA di 120
const UMANE = "('esito','chiamata','nota','email','cambio_fase','contatto')";
const PAUSE_PER_GIRO = 3;

// Costo misurato con contaD1 (tests/avvisi.test.ts, "costo del lavoro"): 8 query fisse (chiusure 1,
// leggiSla 2, lead 1, proposte 1, integrazioni 1, avvisi della settimana 1, destinatari 1). Ogni unità del
// limite è una query: un avviso nuovo costa 1 (un INSERT), una fine pausa 3 (UPDATE e nota in batch, più l'avviso).
export const COSTO_AVVISI = { fisse: 8, perUnita: 1, max: 12 } as const;
const UNITA_PAUSA = 3;

// Chiusure automatiche (spec 8): una sola UPDATE per tutte le famiglie di eventi.
async function chiudiFatti(db: D1Database, now: number, mese: string) {
  await db.prepare(`UPDATE notifications SET closed_at = ?1 WHERE closed_at IS NULL AND (
      (evento IN ('lead_nuovo','sla_90','sla_scaduto') AND EXISTS (SELECT 1 FROM leads l WHERE l.id = notifications.entity_id
        AND (l.first_response_at IS NOT NULL OR l.stage_id <> '${FASE_PRIMA_CHIAMATA}' OR l.deleted_at IS NOT NULL)))
      OR (evento IN ('proposta_oggi','fine_pausa') AND EXISTS (SELECT 1 FROM activities a WHERE a.lead_id = notifications.entity_id
        AND a.type IN ${UMANE} AND a.author_id IS NOT NULL AND a.created_at > notifications.created_at))
      OR (evento = 'integrazione_rotta' AND EXISTS (SELECT 1 FROM integration_status s WHERE s.ok = 1 AND notifications.entity_id LIKE s.key || ':%'))
      OR (evento = 'claude_tetto' AND entity_id < ?2))`).bind(now, mese).run();
}

type RigaLead = { tipo: "nuovo" | "pausa"; id: string; company: string; ownerId: string | null; createdAt: number; stageId: string; pausedUntil: number | null };

export async function controllaAvvisi(env: Env, now: number, limite: number): Promise<{ creati: number }> {
  const raw = env.DB;
  const db = getDb(raw);
  const mese = meseRoma(now); // "AAAA-MM": gli avvisi del tetto dei mesi passati si chiudono
  await chiudiFatti(raw, now, mese);

  const sla = await leggiSla(db);
  const settimanaFa = now - 7 * 86_400_000;
  // Le pause finite si prendono solo quante il limite ne copre (3 unità l'una): chi esce dalla pausa ha
  // sempre il suo avviso nello stesso giro. Con un limite piccolo le pause aspettano il giro dopo.
  const pauseMax = Math.min(PAUSE_PER_GIRO, Math.floor(limite / UNITA_PAUSA));
  const [righe, proposte, rotte, esistenti] = await Promise.all([
    // Lead in attesa della prima chiamata (i più recenti: sono quelli col preavviso) e pause finite, in una lettura.
    raw.prepare(`SELECT * FROM (SELECT 'nuovo' AS tipo, id, company, owner_id AS ownerId, created_at AS createdAt, stage_id AS stageId, paused_until AS pausedUntil FROM leads
        WHERE stage_id = ?1 AND first_response_at IS NULL AND deleted_at IS NULL AND created_at > ?2 ORDER BY created_at DESC LIMIT 20)
      UNION ALL
      SELECT * FROM (SELECT 'pausa' AS tipo, id, company, owner_id AS ownerId, created_at AS createdAt, stage_id AS stageId, paused_until AS pausedUntil FROM leads
        WHERE stage_id = 'probabilmente-bloccato' AND paused_until IS NOT NULL AND paused_until <= ?3 AND deleted_at IS NULL ORDER BY paused_until LIMIT ?4)`)
      .bind(FASE_PRIMA_CHIAMATA, settimanaFa, now, pauseMax).all<RigaLead>(),
    raw.prepare(`SELECT p.number, l.id, l.company, l.owner_id AS ownerId, l.next_action_at AS nextActionAt FROM proposals p JOIN leads l ON l.id = p.lead_id
      WHERE p.status = 'presentata' AND p.deleted_at IS NULL AND l.deleted_at IS NULL AND l.stage_id = 'in-attesa-decisione'
        AND l.next_action_at IS NOT NULL AND l.next_action_at < ?1 LIMIT 10`)
      .bind(inizioGiornoRoma(now) + 86_400_000).all<{ number: string; id: string; company: string; ownerId: string | null; nextActionAt: number }>(),
    raw.prepare("SELECT key, error_id AS errorId FROM integration_status WHERE ok = 0 AND key IN ('foglio','resend')").all<{ key: string; errorId: string | null }>(),
    raw.prepare("SELECT chiave FROM notifications WHERE created_at > ?1").bind(settimanaFa).all<{ chiave: string }>(),
  ]);
  const gia = new Set(esistenti.results.map((r) => r.chiave));
  const tutti = await destinatari(db, { evento: "lead_nuovo" });

  const pausa: NuovoAvviso[] = [];
  const candidati: NuovoAvviso[] = [];
  // Fine pausa (spec 6.3): l'unica regola che agisce da sola. Prossima azione oggi, poi l'avviso.
  // Il suo avviso è già pagato nelle 3 unità: il lead esce dalla pausa una volta sola, l'avviso non può restare fuori.
  for (const l of righe.results.filter((r) => r.tipo === "pausa")) {
    const azione = finePausa(l, now);
    if (!azione) continue;
    await raw.batch([
      raw.prepare("UPDATE leads SET paused_until = NULL, next_action = ?1, next_action_at = ?2, updated_at = ?2 WHERE id = ?3").bind(azione.nextAction, azione.nextActionAt, l.id),
      raw.prepare("INSERT INTO activities (id, lead_id, type, body, author_id, created_at) VALUES (?1, ?2, 'nota', 'Fine della pausa: da richiamare', NULL, ?3)").bind(crypto.randomUUID(), l.id, now),
    ]);
    pausa.push({ evento: "fine_pausa", entityId: l.id, turno: String(l.pausedUntil), titolo: `Fine della pausa: ${l.company}`, href: `/commerciale/lead/${l.id}`, responsabile: l.ownerId });
  }
  for (const l of righe.results.filter((r) => r.tipo === "nuovo")) {
    const scade = scadenzaPrimaChiamata(l.createdAt, sla);
    const href = `/commerciale/lead/${l.id}`;
    if (now >= scade) candidati.push({ evento: "sla_scaduto", entityId: l.id, titolo: `Prima chiamata scaduta: ${l.company}`, href });
    else if (now >= scade - MINUTI_PREAVVISO * 60_000) candidati.push({ evento: "sla_90", entityId: l.id, titolo: `Da chiamare entro 30 minuti: ${l.company}`, href, responsabile: l.ownerId });
  }
  for (const p of proposte.results) {
    candidati.push({ evento: "proposta_oggi", entityId: p.id, turno: giornoRoma(p.nextActionAt), titolo: `Proposta ${p.number} da seguire oggi: ${p.company}`, href: `/commerciale/lead/${p.id}`, responsabile: p.ownerId });
  }
  for (const r of rotte.results) {
    candidati.push({ evento: "integrazione_rotta", entityId: `${r.key}:${r.errorId ?? "x"}`, titolo: r.key === "foglio" ? "Il foglio di Andrea non si legge" : "Resend non manda le email", href: "/impostazioni" });
  }

  // Un INSERT per candidato con almeno una persona ancora da avvisare; quelli già avvisati non costano nulla.
  let creati = 0;
  let fatti = 0;
  const resto = limite - pausa.length * UNITA_PAUSA;
  for (const [i, c] of [...pausa, ...candidati].entries()) {
    if (i >= pausa.length && fatti >= resto) break;
    const chi = c.responsabile && (c.evento === "sla_90" || c.evento === "proposta_oggi" || c.evento === "fine_pausa") ? [c.responsabile] : tutti;
    const nuoviChi = chi.filter((u) => !gia.has(chiaveAvviso(c.evento, c.entityId, u, c.turno)));
    if (!nuoviChi.length) continue;
    creati += await avvisa(db, c, now, nuoviChi);
    if (i >= pausa.length) fatti += 1;
  }
  return { creati };
}

// Spec 8: Meta senza lead da 48 ore. Oggetto dell'avviso = ultimo lead Meta: un lead nuovo chiude il silenzio.
// Costo: 3 query (ultimo lead, chiusura, un INSERT per tutti).
export async function controllaMeta48(env: Env, now: number): Promise<boolean> {
  if (!env.META_PAGE_TOKEN) return false;
  const db = getDb(env.DB);
  const ultimo = await env.DB.prepare("SELECT id, created_at AS createdAt FROM leads WHERE source = 'meta' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1").first<{ id: string; createdAt: number }>();
  if (!ultimo) return false;
  await env.DB.prepare("UPDATE notifications SET closed_at = ?1 WHERE closed_at IS NULL AND evento = 'meta_48h' AND entity_id <> ?2").bind(now, `meta:${ultimo.id}`).run();
  if (now - ultimo.createdAt < 48 * 3_600_000) return false;
  await avvisa(db, { evento: "meta_48h", entityId: `meta:${ultimo.id}`, titolo: "Meta non manda lead da 48 ore", testo: "Controlla campagne e modulo in Gestione inserzioni.", href: "/impostazioni/integrazioni/meta" }, now);
  return true;
}
