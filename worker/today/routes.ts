import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";

export const STALE_DAYS = 7;
const DAY = 86_400_000;
const HUMAN_TYPES = "('nota','chiamata','email','cambio_fase')";
const COLS = `l.id, l.company, l.contact_name AS contactName, l.stage_id AS stageId, s.label AS stageLabel, l.next_action AS nextAction,
  l.next_action_at AS nextActionAt, l.appointment_at AS appointmentAt, l.stage_changed_at AS stageChangedAt, l.source, l.meta_campaign AS metaCampaign`;
const FROM = "FROM leads l JOIN stages s ON s.id = l.stage_id";
const OPEN = "l.deleted_at IS NULL AND s.kind = 'open'";

const todaySchema = z.object({
  from: z.coerce.number().int(),
  until: z.coerce.number().int(),
  now: z.coerce.number().int().optional(),
});
const statsSchema = z.object({
  from: z.coerce.number().int().default(0),
  until: z.coerce.number().int().default(Number.MAX_SAFE_INTEGER),
});

export const todayRoutes = new Hono<AppEnv>();

todayRoutes.get("/today", async (c) => {
  const { from, until, now = Date.now() } = todaySchema.parse(c.req.query());
  const db = c.env.DB;
  const all = async (sql: string, ...binds: unknown[]) => (await db.prepare(sql).bind(...binds).all()).results;
  const [due, appointments, untouched, stale, missingAction, metaIncomplete] = await Promise.all([
    all(`SELECT ${COLS} ${FROM} WHERE ${OPEN} AND l.next_action_at <= ? ORDER BY l.next_action_at`, until),
    all(`SELECT ${COLS} ${FROM} WHERE l.deleted_at IS NULL AND l.appointment_at BETWEEN ? AND ? ORDER BY l.appointment_at`, from, until),
    all(
      `SELECT ${COLS} ${FROM} WHERE ${OPEN} AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.lead_id = l.id AND a.type IN ${HUMAN_TYPES}) ORDER BY l.created_at DESC`,
    ),
    all(`SELECT ${COLS} ${FROM} WHERE ${OPEN} AND l.stage_changed_at < ? ORDER BY l.stage_changed_at`, now - STALE_DAYS * DAY),
    all(`SELECT ${COLS} ${FROM} WHERE ${OPEN} AND (l.next_action_at IS NULL OR l.next_action IS NULL) ORDER BY l.created_at`),
    all(`SELECT ${COLS} ${FROM} WHERE l.deleted_at IS NULL AND l.meta_status IN ('pending','error') ORDER BY l.created_at`),
  ]);
  return c.json({ due, appointments, untouched, stale, missingAction, metaIncomplete });
});

todayRoutes.get("/stats", async (c) => {
  const { from, until } = statsSchema.parse(c.req.query());
  const db = c.env.DB;
  const range = "l.deleted_at IS NULL AND l.created_at BETWEEN ? AND ?";
  const [bySource, byCampaign, byStage, firstResponse] = await Promise.all([
    db.prepare(`SELECT l.source, COUNT(*) AS total, SUM(s.kind = 'won') AS won, SUM(s.kind = 'lost') AS lost ${FROM} WHERE ${range} GROUP BY l.source ORDER BY total DESC`).bind(from, until).all(),
    db.prepare(`SELECT COALESCE(l.meta_campaign, '(senza campagna)') AS campaign, COUNT(*) AS total, SUM(s.kind = 'won') AS won, SUM(s.kind = 'lost') AS lost ${FROM} WHERE ${range} AND l.source = 'meta' GROUP BY campaign ORDER BY total DESC`).bind(from, until).all(),
    db.prepare(`SELECT s.id AS stageId, s.label, COUNT(l.id) AS count FROM stages s LEFT JOIN leads l ON l.stage_id = s.id AND ${range} GROUP BY s.id ORDER BY s.sort_order`).bind(from, until).all(),
    db.prepare(
      `SELECT AVG(first_at - created_at) AS avgMs, COUNT(*) AS count FROM (
         SELECT l.created_at, (SELECT MIN(a.created_at) FROM activities a WHERE a.lead_id = l.id AND a.type IN ${HUMAN_TYPES}) AS first_at
         FROM leads l WHERE ${range}
       ) WHERE first_at IS NOT NULL`,
    ).bind(from, until).first<{ avgMs: number | null; count: number }>(),
  ]);
  return c.json({ bySource: bySource.results, byCampaign: byCampaign.results, byStage: byStage.results, firstResponse });
});
