import type { EventoAvviso } from "../db/schema";
import type { Env } from "../env";
import { mandaPush, pushCollegate, scritturaDispositivo, type EsitoPush } from "../push/invio";
import { canaleAcceso, inSilenzio } from "./silenzio";

const VECCHIO = 6 * 3_600_000; // una push di più di 6 ore non serve più: si segna e si salta

type Pendente = { id: string; userId: string; evento: EventoAvviso; titolo: string; testo: string | null; href: string | null; createdAt: number; quiet: string | null; prefs: string | null };
type Sub = { id: string; userId: string; endpoint: string; p256dh: string; auth: string; errori: number };

// Lavoro "consegna" del giro. Costo misurato con contaD1: 2 letture (avvisi in attesa, dispositivi) più una
// batch con al massimo una scrittura per push e una per avviso; gli avvisi letti sono al massimo `limite`,
// quindi il totale resta sotto 3 fisse più 2 a unità anche quando molti avvisi si saltano senza push.
// Una sottorichiesta per push. Avvisi del lavoro "avvisi" e "Lead nuovo" della catena girano prima nel giro,
// quindi partono nello stesso giro in cui nascono.
export async function consegnaPush(env: Env, now: number, limite: number): Promise<{ inviate: number; saltate: number }> {
  if (!pushCollegate(env) || limite < 1) return { inviate: 0, saltate: 0 }; // restano in coda: "Non collegato", nessun errore
  const db = env.DB;
  const pendenti = (await db.prepare(`SELECT n.id, n.user_id AS userId, n.evento, n.titolo, n.testo, n.href, n.created_at AS createdAt,
      u.quiet_hours AS quiet, u.notify_prefs AS prefs
    FROM notifications n JOIN users u ON u.id = n.user_id
    WHERE n.push_at IS NULL AND n.closed_at IS NULL AND n.read_at IS NULL ORDER BY n.created_at LIMIT ?1`).bind(limite).all<Pendente>()).results;
  if (!pendenti.length) return { inviate: 0, saltate: 0 };
  const utenti = [...new Set(pendenti.map((p) => p.userId))];
  const subs = (await db.prepare(`SELECT id, user_id AS userId, endpoint, p256dh, auth, errori FROM push_subscriptions
    WHERE rotta = 0 AND user_id IN (${utenti.map((_, i) => `?${i + 1}`).join(",")})`).bind(...utenti).all<Sub>()).results;

  let inviate = 0;
  let saltate = 0;
  const scritture: D1PreparedStatement[] = [];
  // Un dispositivo si scrive una volta sola per giro, con l'ultimo esito; uno sparito non riceve altro.
  const esiti = new Map<string, EsitoPush>();
  for (const p of pendenti) {
    const mie = subs.filter((s) => s.userId === p.userId && esiti.get(s.id) !== "sparita");
    const salta = now - p.createdAt > VECCHIO || inSilenzio(p.quiet, now) || !canaleAcceso(p.prefs, p.evento) || mie.length === 0;
    if (salta) {
      saltate++;
      scritture.push(db.prepare("UPDATE notifications SET push_at = ?1 WHERE id = ?2").bind(now, p.id));
      continue;
    }
    // Un avviso si consegna a tutti i dispositivi della persona o resta per il giro dopo: mai a metà.
    // Se non entra nel limite rimasto aspetta, ma gli avvisi dopo (di altre persone, con meno dispositivi) partono.
    if (inviate + mie.length > limite) continue;
    const questi: EsitoPush[] = [];
    for (const s of mie) {
      inviate++;
      const esito = await mandaPush(env, s, { titolo: p.titolo, testo: p.testo ?? undefined, href: p.href ?? "/", tag: p.id }, now);
      esiti.set(s.id, esito);
      questi.push(esito);
    }
    // 5xx, rete giù o 429 su tutti i dispositivi: l'avviso resta in coda e si ritenta al giro dopo, fino a VECCHIO.
    const daRitentare = !questi.includes("ok") && questi.some((e) => e === "ritenta" || e === "occupato");
    if (!daRitentare) scritture.push(db.prepare("UPDATE notifications SET push_at = ?1 WHERE id = ?2").bind(now, p.id));
  }
  for (const [id, esito] of esiti) {
    const w = scritturaDispositivo(db, id, esito, now);
    if (w) scritture.push(w);
  }
  if (scritture.length) await db.batch(scritture);
  return { inviate, saltate };
}
