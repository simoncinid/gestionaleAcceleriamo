import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { daRoma, partiRoma } from "../lib/roma";
import { listLeads } from "../leads/service";
import { conProssima } from "../processo/leggi";
import { FASI_APERTE } from "../processo/processo";
import { conScadenzaSla, leggiSla } from "../regole/sla";
import type { CallOggi, Oggi, RigaOggi } from "./tipi";

type CallGrezza = Omit<CallOggi, "scheda"> & { schedaStato: string | null };

const oggiSchema = z.object({
  chi: z.enum(["mie", "tutte"]).default("mie"),
  now: z.coerce.number().int().optional(),
});

const APERTE = new Set<string>(FASI_APERTE);

export const todayRoutes = new Hono<AppEnv>();

// Contratto blocco 1, sezione 5: Oggi è una lista sola, "Da fare oggi". Le righe sono i lead aperti con la prossima
// azione scaduta o in scadenza oggi, presi dalla stessa catena di GET /api/leads (listLeads, scadenza SLA,
// conProssima): così il numero coincide con la tabella filtrata su scaduti più oggi dello stesso responsabile.
// "mie": solo i lead con responsabile uguale all'utente (i non assegnati stanno in "tutte"). Un lead, una riga.
// La stessa funzione dà il numero del badge del Commerciale.
export async function calcolaOggi(db: D1Database, io: string, chi: "mie" | "tutte", ora: number): Promise<Oggi> {
  const orm = getDb(db);
  const p = partiRoma(ora);
  const inizio = daRoma(p.anno, p.mese, p.giorno);
  const fine = daRoma(p.anno, p.mese, p.giorno + 1);
  const filtroChi = chi === "mie" ? "AND l.owner_id = ?1" : "AND ?1 = ?1";

  const [elenco, sla, callGrezze] = await Promise.all([
    listLeads(orm, chi === "mie" ? { ownerId: io } : {}),
    leggiSla(orm),
    db.prepare(`SELECT k.id, k.lead_id AS leadId, l.company, l.contact_name AS contactName, l.phone, k.kind, k.scheduled_at AS scheduledAt, k.meet_link AS meetLink,
        -- Come statoScheda: durante "Rigenera" resta pronta se una versione pronta c'è già.
        CASE WHEN EXISTS (SELECT 1 FROM company_profiles cp WHERE cp.lead_id = l.id AND cp.status = 'ready') THEN 'ready'
          ELSE (SELECT cp.status FROM company_profiles cp WHERE cp.lead_id = l.id ORDER BY cp.version DESC LIMIT 1) END AS schedaStato
      FROM calls k JOIN leads l ON l.id = k.lead_id WHERE k.deleted_at IS NULL AND l.deleted_at IS NULL ${filtroChi}
        AND k.scheduled_at >= ?2 AND k.scheduled_at < ?3 ORDER BY k.scheduled_at`).bind(io, inizio, fine).all<CallGrezza>().then((r) => r.results),
  ]);

  const call: CallOggi[] = callGrezze.map(({ schedaStato, ...k }) => ({
    ...k,
    scheda: schedaStato === "ready" ? "pronta" : schedaStato === "queued" || schedaStato === "running" ? "in_preparazione" : null,
  }));
  const meet = new Map(call.filter((k) => k.meetLink).map((k) => [k.leadId, k.meetLink]));

  const aperti = elenco.filter((l) => APERTE.has(l.stageId)).map((l) => conScadenzaSla(l, sla));
  const conAzione = await conProssima(orm, aperti, ora);
  const righe: RigaOggi[] = conAzione
    .filter((l) => (l.prossima.stato === "scaduto" || l.prossima.stato === "oggi") && l.prossima.scadenza != null)
    // Prima i più scaduti, poi quelli di oggi per ora.
    .sort((a, b) => a.prossima.scadenza! - b.prossima.scadenza! || a.company.localeCompare(b.company, "it"))
    .map((l) => ({
      id: l.id, company: l.company, contactName: l.contactName, phone: l.phone, email: l.email, stageId: l.stageId,
      ownerId: l.ownerId, attemptCount: l.attemptCount, setupCents: l.setupCents, feeCents: l.feeCents,
      prossima: l.prossima, meetLink: meet.get(l.id) ?? null,
    }));
  return { righe, call, totale: righe.length };
}

todayRoutes.get("/today", async (c) => {
  const q = oggiSchema.parse(c.req.query());
  return c.json(await calcolaOggi(c.env.DB, c.get("user").id, q.chi, q.now ?? Date.now()));
});
