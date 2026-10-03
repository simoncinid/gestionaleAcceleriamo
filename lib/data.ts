import { env } from "cloudflare:workers";
import { permissionsForRole, ROLE_PRESETS } from "@/lib/permissions";

const stageSeed = [
  ["da-chiamare-prima-volta", "Da chiamare prima volta", 10, "orange"],
  ["non-chiamato", "Non Chiamato", 20, "neutral"],
  ["da-richiamare", "Da Richiamare", 30, "yellow"],
  ["appuntamento-confermato", "Appuntamento confermato", 40, "blue"],
  ["presentazione-confermata", "Presentazione Confermata", 50, "violet"],
  ["in-attesa-preventivo", "In Attesa Preventivo", 60, "orange"],
  ["in-attesa-decisione", "In attesa decisione", 70, "yellow"],
  ["probabilmente-bloccato", "Probabilmente bloccato", 80, "neutral"],
  ["chiuso", "Chiuso", 90, "green"],
  ["non-chiuso", "Non Chiuso", 100, "red"],
  ["fuori-target", "Fuori Target", 110, "red"],
  ["fake", "Fake", 120, "red"],
] as const;

export type TaskBlueprintItem = {
  title: string;
  description?: string;
  priority?: string;
  offsetDays?: number;
  kind?: string;
  recurrence?: string | null;
  scheduleDay?: number;
  assigneeRole?: string;
  assigneeId?: string;
};

export function getRawDb() {
  if (!env.DB) throw new Error("Database non disponibile");
  return env.DB;
}

export const uid = () => crypto.randomUUID();

async function columnNames(db: D1Database, table: string) {
  const rows = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return new Set((rows.results || []).map((row) => row.name));
}

async function addColumn(db: D1Database, table: string, column: string, ddl: string) {
  const cols = await columnNames(db, table);
  if (!cols.has(column)) await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run();
}

export async function ensureSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS activities (
    id text PRIMARY KEY NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text DEFAULT '' NOT NULL,
    actor_id text,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities (entity_type, entity_id)").run();

  await addColumn(db, "team_members", "email", "email text DEFAULT '' NOT NULL");
  await addColumn(db, "team_members", "role", "role text DEFAULT 'commerciale' NOT NULL");
  await addColumn(db, "team_members", "permissions", "permissions text DEFAULT '{}' NOT NULL");
  await addColumn(db, "team_members", "active", "active integer DEFAULT 1 NOT NULL");

  await addColumn(db, "leads", "owner_id", "owner_id text");
  await addColumn(db, "leads", "appointment_at", "appointment_at text");
  await addColumn(db, "leads", "meeting_link", "meeting_link text DEFAULT '' NOT NULL");
  await addColumn(db, "leads", "proposal_url", "proposal_url text DEFAULT '' NOT NULL");
  await addColumn(db, "leads", "last_contact_at", "last_contact_at text");
  await addColumn(db, "leads", "call_notes", "call_notes text DEFAULT '' NOT NULL");

  await addColumn(db, "clients", "owner_id", "owner_id text");
  await addColumn(db, "clients", "notes", "notes text DEFAULT '' NOT NULL");
  await addColumn(db, "clients", "status", "status text DEFAULT 'attivo' NOT NULL");

  await addColumn(db, "documents", "kind", "kind text DEFAULT 'altro' NOT NULL");
  await addColumn(db, "documents", "external_url", "external_url text DEFAULT '' NOT NULL");

  await addColumn(db, "tasks", "job_id", "job_id text");
  await addColumn(db, "tasks", "kind", "kind text DEFAULT 'oneoff' NOT NULL");
  await addColumn(db, "tasks", "recurrence", "recurrence text");
  await addColumn(db, "tasks", "next_due_at", "next_due_at text");
  await addColumn(db, "tasks", "visible_from", "visible_from text");

  await addColumn(db, "job_templates", "task_blueprint", "task_blueprint text DEFAULT '[]' NOT NULL");
  await addColumn(db, "job_templates", "recurring_price", "recurring_price real DEFAULT 0 NOT NULL");
  await addColumn(db, "job_templates", "recurring_task_blueprint", "recurring_task_blueprint text DEFAULT '[]' NOT NULL");
  await addColumn(db, "job_templates", "recurrence_enabled", "recurrence_enabled integer DEFAULT 0 NOT NULL");
  await addColumn(db, "job_templates", "payment_enabled", "payment_enabled integer DEFAULT 0 NOT NULL");
  await addColumn(db, "job_templates", "payment_recurrence", "payment_recurrence text DEFAULT 'oneoff' NOT NULL");

  await addColumn(db, "jobs", "lead_id", "lead_id text");
  await addColumn(db, "jobs", "notes", "notes text DEFAULT '' NOT NULL");
  await addColumn(db, "jobs", "recurring_price", "recurring_price real DEFAULT 0 NOT NULL");
  await addColumn(db, "jobs", "is_recurring", "is_recurring integer DEFAULT 0 NOT NULL");
  await addColumn(db, "jobs", "recurrence_day", "recurrence_day integer");
  await addColumn(db, "jobs", "parent_job_id", "parent_job_id text");
  await addColumn(db, "jobs", "recurrence_period", "recurrence_period text");
  await addColumn(db, "jobs", "recurrence_paused", "recurrence_paused integer DEFAULT 0 NOT NULL");
  await addColumn(db, "jobs", "recurrence_resume_from", "recurrence_resume_from text");
  await addColumn(db, "jobs", "last_generated_period", "last_generated_period text");
  await addColumn(db, "jobs", "recurrence_started_at", "recurrence_started_at text");

  await addColumn(db, "payments", "job_id", "job_id text");
  await addColumn(db, "payments", "series_id", "series_id text");
  await db.prepare(`CREATE TABLE IF NOT EXISTS job_assignments (
    job_id text NOT NULL,
    member_id text NOT NULL,
    PRIMARY KEY (job_id, member_id)
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_job_assignments_job_id ON job_assignments (job_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_job_assignments_member_id ON job_assignments (member_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_job_id ON payments (job_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_payments_series_id ON payments (series_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_parent_period ON jobs (parent_job_id, recurrence_period)").run();
  await db.prepare(`INSERT OR IGNORE INTO job_assignments (job_id,member_id)
    SELECT id,owner_id FROM jobs WHERE owner_id IS NOT NULL AND owner_id != ''`).run();
}

export async function ensureDefaults(db: D1Database) {
  await ensureSchema(db);
  // Questi erano i tre modelli dimostrativi delle prime versioni. I lavori ora
  // vengono definiti interamente dall'utente.
  await db.prepare("DELETE FROM job_templates WHERE id IN ('tpl-ai','tpl-automation','tpl-software')").run();
  const count = await db.prepare("SELECT COUNT(*) AS total FROM pipeline_stages").first<{ total: number }>();
  if ((count?.total ?? 0) === 0) {
    const adminPerms = JSON.stringify(ROLE_PRESETS.admin);
    const commercialPerms = JSON.stringify(ROLE_PRESETS.commerciale);
    await db.batch([
      ...stageSeed.map((row) => db.prepare("INSERT INTO pipeline_stages (id,label,sort_order,tone) VALUES (?,?,?,?)").bind(...row)),
      db.prepare("INSERT INTO team_members (id,name,initials,color,email,role,permissions,active) VALUES (?,?,?,?,?,?,?,1)")
        .bind("diego", "Diego", "DS", "#ff5a1f", "diego@acceleriamo.it", "admin", adminPerms),
      db.prepare("INSERT INTO team_members (id,name,initials,color,email,role,permissions,active) VALUES (?,?,?,?,?,?,?,1)")
        .bind("tommaso", "Tommaso", "TR", "#1d1b19", "tommaso@acceleriamo.it", "commerciale", commercialPerms),
    ]);
    return;
  }

  // Migrazione soft dei ruoli sui seed esistenti.
  const diego = await db.prepare("SELECT role,permissions FROM team_members WHERE id='diego'").first<{ role: string; permissions: string }>();
  if (diego && (!diego.role || diego.role === "commerciale") && (!diego.permissions || diego.permissions === "{}")) {
    await db.prepare("UPDATE team_members SET role=?, permissions=? WHERE id='diego'")
      .bind("admin", JSON.stringify(ROLE_PRESETS.admin)).run();
  }
}

export async function logActivity(
  db: D1Database,
  input: { entityType: string; entityId: string; type: string; title: string; body?: string; actorId?: string | null },
) {
  await db.prepare("INSERT INTO activities (id,entity_type,entity_id,type,title,body,actor_id) VALUES (?,?,?,?,?,?,?)")
    .bind(uid(), input.entityType, input.entityId, input.type, input.title, input.body || "", input.actorId || null).run();
}

function addDays(isoDate: string | null | undefined, days: number) {
  const base = isoDate ? new Date(isoDate) : new Date();
  if (Number.isNaN(base.getTime())) base.setTime(Date.now());
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

export function parseBlueprint(raw: unknown): TaskBlueprintItem[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as TaskBlueprintItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.title === "string" && item.title.trim()).map((item) => ({
      ...item,
      title: item.title.trim(),
      offsetDays: Math.max(0, Number(item.offsetDays) || 0),
      kind: item.kind === "recurring" ? "recurring" : "oneoff",
      recurrence: item.kind === "recurring" && item.recurrence === "settimanale" ? "settimanale" : item.kind === "recurring" ? "mensile" : null,
      scheduleDay: Math.max(1, Number(item.scheduleDay) || 1),
      assigneeId: typeof item.assigneeId === "string" ? item.assigneeId : undefined,
    }));
  } catch {
    return [];
  }
}

function scheduledDue(item: TaskBlueprintItem, startDate?: string | null) {
  const rawBase = (startDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const base = new Date(`${rawBase}T00:00:00Z`);
  if (item.recurrence === "settimanale") {
    const target = Math.min(7, Math.max(1, Number(item.scheduleDay) || 1));
    const current = base.getUTCDay() || 7;
    base.setUTCDate(base.getUTCDate() + ((target - current + 7) % 7));
    return base.toISOString().slice(0, 10);
  }
  const target = Math.min(31, Math.max(1, Number(item.scheduleDay) || 1));
  const inMonth = (year: number, month: number) => {
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(target, last)));
  };
  let candidate = inMonth(base.getUTCFullYear(), base.getUTCMonth());
  if (candidate < base) candidate = inMonth(base.getUTCFullYear(), base.getUTCMonth() + 1);
  return candidate.toISOString().slice(0, 10);
}

export async function spawnJobTasks(
  db: D1Database,
  input: {
    jobId: string;
    clientId: string;
    leadId?: string | null;
    ownerId: string;
    startDate?: string | null;
    blueprintRaw?: unknown;
  },
) {
  const blueprint = parseBlueprint(input.blueprintRaw);
  const statements = blueprint.map((item) => {
    const kind = item.kind === "recurring" ? "recurring" : "oneoff";
    const due = kind === "recurring" ? scheduledDue(item, input.startDate) : addDays(input.startDate, item.offsetDays ?? 0);
    return db.prepare(
      "INSERT INTO tasks (id,title,description,assignee_id,lead_id,client_id,job_id,priority,kind,recurrence,next_due_at,visible_from,due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      uid(),
      item.title,
      item.description || "",
      item.assigneeId || input.ownerId,
      input.leadId || null,
      input.clientId,
      input.jobId,
      item.priority || "media",
      kind,
      kind === "recurring" ? (item.recurrence || "mensile") : null,
      kind === "recurring" ? due : null,
      due,
      due,
    );
  });
  if (statements.length) await db.batch(statements);
}

export function parseMemberIds(raw: unknown, fallback?: string) {
  const values = Array.isArray(raw) ? raw : String(raw || "").split(",");
  const ids = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
  if (fallback && !ids.includes(fallback)) ids.unshift(fallback);
  return ids;
}

export async function replaceJobAssignments(db: D1Database, jobId: string, memberIds: string[]) {
  const valid: string[] = [];
  for (const memberId of [...new Set(memberIds)]) {
    const member = await db.prepare("SELECT id FROM team_members WHERE id=? AND active=1").bind(memberId).first();
    if (member) valid.push(memberId);
  }
  await db.batch([
    db.prepare("DELETE FROM job_assignments WHERE job_id=?").bind(jobId),
    ...valid.map((memberId) => db.prepare("INSERT INTO job_assignments (job_id,member_id) VALUES (?,?)").bind(jobId, memberId)),
  ]);
}

export async function createJobPayment(
  db: D1Database,
  input: { jobId: string; clientId: string; title: string; amount: number; dueDate: string | null; recurring: boolean },
) {
  const existing = await db.prepare("SELECT id FROM payments WHERE job_id=? LIMIT 1").bind(input.jobId).first();
  if (existing) return;
  await db.prepare(
    "INSERT INTO payments (id,client_id,job_id,description,amount,status,kind,recurrence,due_date,next_issue_at) VALUES (?,?,?,?,?,'due',?,?,?,?)",
  ).bind(
    uid(), input.clientId, input.jobId, input.title, input.amount,
    input.recurring ? "recurring" : "oneoff",
    input.recurring ? "mensile" : null,
    input.dueDate,
    input.recurring ? input.dueDate : null,
  ).run();
}

export async function activateJobRecurrenceIfReady(
  db: D1Database,
  jobId: string,
  activationDate = new Date().toISOString().slice(0, 10),
  allowEmptySetup = false,
) {
  const job = await db.prepare(`SELECT j.*,t.recurring_task_blueprint
    FROM jobs j LEFT JOIN job_templates t ON t.id=j.template_id WHERE j.id=?`).bind(jobId).first<Record<string, unknown>>();
  if (!job || Number(job.is_recurring || 0) !== 1 || job.parent_job_id || job.recurrence_started_at) return false;
  const counts = await db.prepare(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN status!='done' THEN 1 ELSE 0 END) AS pending
    FROM tasks WHERE job_id=? AND kind='oneoff'`).bind(jobId).first<{ total: number; pending: number }>();
  if (((counts?.total || 0) === 0 && !allowEmptySetup) || (counts?.pending || 0) > 0) return false;

  await db.prepare(`UPDATE jobs SET recurrence_started_at=?,recurrence_resume_from=?,last_generated_period=NULL,status='in-corso'
    WHERE id=? AND recurrence_started_at IS NULL`).bind(activationDate, activationDate, jobId).run();
  await spawnJobTasks(db, {
    jobId,
    clientId: String(job.client_id),
    leadId: job.lead_id ? String(job.lead_id) : null,
    ownerId: String(job.owner_id),
    startDate: activationDate,
    blueprintRaw: job.recurring_task_blueprint || "[]",
  });
  await logActivity(db, {
    entityType: "job", entityId: jobId, type: "recurrence_started",
    title: "Fase ricorrente avviata", body: `Setup completato il ${activationDate}`,
  });
  return true;
}

export async function syncJobAfterTaskChange(db: D1Database, jobId: string, allowEmptySetup = false) {
  const job = await db.prepare("SELECT is_recurring,status FROM jobs WHERE id=?").bind(jobId).first<{ is_recurring: number; status: string }>();
  if (!job) return;
  const counts = await db.prepare(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN status!='done' THEN 1 ELSE 0 END) AS pending
    FROM tasks WHERE job_id=? AND kind='oneoff'`).bind(jobId).first<{ total: number; pending: number }>();
  const total = counts?.total || 0;
  const pending = counts?.pending || 0;
  if (pending === 0 && (total > 0 || allowEmptySetup)) {
    if (Number(job.is_recurring || 0) === 1) {
      await activateJobRecurrenceIfReady(db, jobId, new Date().toISOString().slice(0, 10), allowEmptySetup);
    } else if (total > 0) {
      await db.prepare("UPDATE jobs SET status='completato' WHERE id=?").bind(jobId).run();
    }
  } else if (pending > 0 && job.status === "completato") {
    await db.prepare("UPDATE jobs SET status='in-corso' WHERE id=?").bind(jobId).run();
  }
}

function monthDueDate(year: number, monthIndex: number, day: number) {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(Math.min(Math.max(day, 1), last)).padStart(2, "0")}`;
}

export async function ensureRecurringJobInstances(db: D1Database, now = new Date()) {
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const parents = await db.prepare(`SELECT j.*,t.recurring_task_blueprint,t.payment_enabled,t.payment_recurrence
    FROM jobs j LEFT JOIN job_templates t ON t.id=j.template_id
    WHERE j.is_recurring=1 AND j.parent_job_id IS NULL`).all<Record<string, unknown>>();
  for (const parent of parents.results || []) {
    if (Number(parent.recurrence_paused || 0) === 1) continue;
    if (parent.recurrence_resume_from && String(parent.recurrence_resume_from).slice(0, 10) > now.toISOString().slice(0, 10)) continue;
    let recurrenceStart = parent.recurrence_started_at ? String(parent.recurrence_started_at).slice(0, 10) : "";
    if (!recurrenceStart) {
      const counts = await db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN status!='done' THEN 1 ELSE 0 END) AS pending
        FROM tasks WHERE job_id=? AND kind='oneoff'`).bind(parent.id).first<{ total: number; pending: number }>();
      if ((counts?.total || 0) > 0) {
        if ((counts?.pending || 0) > 0) continue;
        await activateJobRecurrenceIfReady(db, String(parent.id), now.toISOString().slice(0, 10));
        recurrenceStart = now.toISOString().slice(0, 10);
      } else {
        recurrenceStart = String(parent.due_date || "").slice(0, 10);
        if (recurrenceStart && now.toISOString().slice(0, 10) >= recurrenceStart) {
          await db.prepare("UPDATE jobs SET recurrence_started_at=?,recurrence_resume_from=? WHERE id=? AND recurrence_started_at IS NULL")
            .bind(recurrenceStart, recurrenceStart, parent.id).run();
          await spawnJobTasks(db, {
            jobId: String(parent.id), clientId: String(parent.client_id),
            leadId: parent.lead_id ? String(parent.lead_id) : null, ownerId: String(parent.owner_id),
            startDate: recurrenceStart, blueprintRaw: parent.recurring_task_blueprint || "[]",
          });
        }
      }
    }
    if (String(parent.last_generated_period || "") >= period) continue;
    const day = Math.min(31, Math.max(1, Number(parent.recurrence_day) || 1));
    const dueDate = monthDueDate(now.getUTCFullYear(), now.getUTCMonth(), day);
    // Il canone parte dalla prima occorrenza successiva alla consegna del setup.
    // La consegna non modifica mai le scadenze delle task definite dal modello.
    if (recurrenceStart && dueDate <= recurrenceStart) continue;
    if (now.toISOString().slice(0, 10) < dueDate) continue;

    const existing = await db.prepare("SELECT id FROM jobs WHERE parent_job_id=? AND recurrence_period=? LIMIT 1")
      .bind(parent.id, period).first<{ id: string }>();
    if (existing) {
      await db.prepare("UPDATE jobs SET last_generated_period=? WHERE id=?").bind(period, parent.id).run();
      continue;
    }

    const jobId = uid();
    await db.prepare(`INSERT INTO jobs
      (id,client_id,template_id,lead_id,title,status,price,recurring_price,owner_id,notes,start_date,due_date,is_recurring,recurrence_day,parent_job_id,recurrence_period)
      VALUES (?,?,?,?,?,'pianificato',?,?,?,?,?,?,0,NULL,?,?)`).bind(
      jobId, parent.client_id, parent.template_id, parent.lead_id,
      `${parent.title} · ${period}`,
      Number(parent.recurring_price || 0) > 0 ? parent.recurring_price : parent.price,
      0, parent.owner_id, parent.notes || "", dueDate, dueDate, parent.id, period,
    ).run();
    const assignments = await db.prepare("SELECT member_id FROM job_assignments WHERE job_id=?").bind(parent.id).all<{ member_id: string }>();
    await replaceJobAssignments(db, jobId, (assignments.results || []).map((row) => row.member_id));
    if (Number(parent.payment_enabled || 0) === 1 && ["monthly", "both"].includes(String(parent.payment_recurrence || ""))) {
      await createJobPayment(db, {
        jobId, clientId: String(parent.client_id), title: `${String(parent.title)} · canone ${period}`,
        amount: Number(parent.recurring_price || 0) > 0 ? Number(parent.recurring_price) : Number(parent.price || 0), dueDate, recurring: true,
      });
    }
    await db.prepare("UPDATE jobs SET last_generated_period=? WHERE id=?").bind(period, parent.id).run();
  }
}

export async function completeRecurringTask(db: D1Database, taskId: string) {
  const task = await db.prepare("SELECT * FROM tasks WHERE id=?").bind(taskId).first<Record<string, unknown>>();
  if (!task) return;
  if (task.kind !== "recurring") {
    await db.prepare("UPDATE tasks SET status=CASE status WHEN 'done' THEN 'todo' ELSE 'done' END WHERE id=?").bind(taskId).run();
    if (task.job_id) await syncJobAfterTaskChange(db, String(task.job_id));
    return;
  }
  // Completare un ricorrente: marca done la corrente e crea la prossima
  const recurrence = String(task.recurrence || "mensile");
  const base = task.next_due_at || task.due_date || new Date().toISOString().slice(0, 10);
  const next = new Date(`${String(base).slice(0, 10)}T00:00:00Z`);
  if (recurrence === "giornaliera") next.setUTCDate(next.getUTCDate() + 1);
  else if (recurrence === "settimanale") next.setUTCDate(next.getUTCDate() + 7);
  else if (recurrence === "annuale") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else {
    const months = recurrence === "trimestrale" ? 3 : 1;
    const wantedDay = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + months);
    const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(wantedDay, last));
  }
  const nextIso = next.toISOString().slice(0, 10);
  await db.batch([
    db.prepare("UPDATE tasks SET status='done' WHERE id=?").bind(taskId),
    db.prepare(
      "INSERT INTO tasks (id,title,description,assignee_id,lead_id,client_id,job_id,priority,kind,recurrence,next_due_at,visible_from,due_date,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'todo')",
    ).bind(
      uid(),
      task.title,
      task.description || "",
      task.assignee_id,
      task.lead_id,
      task.client_id,
      task.job_id,
      task.priority || "media",
      "recurring",
      recurrence,
      nextIso,
      nextIso,
      nextIso,
    ),
  ]);
}

export async function readDashboard(db: D1Database) {
  await ensureDefaults(db);
  await ensureRecurringJobInstances(db);
  const [stages, members, leads, clients, docs, tasks, payments, templates, jobs, activities] = await Promise.all([
    db.prepare("SELECT id,label,sort_order AS sortOrder,tone FROM pipeline_stages ORDER BY sort_order").all(),
    db.prepare("SELECT id,name,initials,color,email,role,permissions,active FROM team_members ORDER BY active DESC, name").all(),
    db.prepare(`SELECT id,company,contact_name AS contactName,email,phone,status_id AS statusId,estimated_value AS estimatedValue,source,notes,
      owner_id AS ownerId,appointment_at AS appointmentAt,meeting_link AS meetingLink,proposal_url AS proposalUrl,
      last_contact_at AS lastContactAt,call_notes AS callNotes,created_at AS createdAt,updated_at AS updatedAt
      FROM leads ORDER BY updated_at DESC`).all(),
    db.prepare(`SELECT id,company,contact_name AS contactName,email,phone,lead_id AS leadId,owner_id AS ownerId,notes,status,created_at AS createdAt
      FROM clients ORDER BY created_at DESC`).all(),
    db.prepare(`SELECT id,lead_id AS leadId,client_id AS clientId,name,content_type AS contentType,size,kind,external_url AS externalUrl,
      object_key AS objectKey,uploaded_at AS uploadedAt FROM documents ORDER BY uploaded_at DESC`).all(),
    db.prepare(`SELECT t.id,t.title,t.description,t.assignee_id AS assigneeId,t.lead_id AS leadId,t.client_id AS clientId,t.job_id AS jobId,
      t.status,t.priority,t.kind,t.recurrence,t.next_due_at AS nextDueAt,t.visible_from AS visibleFrom,t.due_date AS dueDate,t.created_at AS createdAt,
      CASE WHEN t.visible_from IS NOT NULL AND date(t.visible_from) > date('now') THEN 1 ELSE 0 END AS isUpcoming,
      m.name AS assigneeName,j.title AS jobTitle,c.company AS clientName
      FROM tasks t
      LEFT JOIN team_members m ON m.id=t.assignee_id
      LEFT JOIN jobs j ON j.id=t.job_id
      LEFT JOIN clients c ON c.id=t.client_id
      ORDER BY CASE WHEN t.status='done' THEN 1 ELSE 0 END, COALESCE(t.due_date,t.next_due_at)`).all(),
    db.prepare(`SELECT p.id,p.client_id AS clientId,p.job_id AS jobId,p.series_id AS seriesId,p.description,p.amount,p.status,p.kind,p.recurrence,p.due_date AS dueDate,
      p.next_issue_at AS nextIssueAt,p.received_at AS receivedAt,p.created_at AS createdAt,c.company AS clientName
      FROM payments p LEFT JOIN clients c ON c.id=p.client_id ORDER BY COALESCE(p.due_date,p.created_at)`).all(),
    db.prepare(`SELECT id,title,description,default_price AS defaultPrice,recurring_price AS recurringPrice,default_days AS defaultDays,task_blueprint AS taskBlueprint,
      recurring_task_blueprint AS recurringTaskBlueprint,recurrence_enabled AS recurrenceEnabled,payment_enabled AS paymentEnabled,
      payment_recurrence AS paymentRecurrence,active,created_at AS createdAt
      FROM job_templates ORDER BY created_at DESC`).all(),
    db.prepare(`SELECT j.id,j.client_id AS clientId,j.template_id AS templateId,j.lead_id AS leadId,j.title,j.status,j.price,j.recurring_price AS recurringPrice,j.owner_id AS ownerId,
      j.notes,j.start_date AS startDate,j.due_date AS dueDate,j.is_recurring AS isRecurring,j.recurrence_day AS recurrenceDay,
      j.parent_job_id AS parentJobId,j.recurrence_period AS recurrencePeriod,j.recurrence_paused AS recurrencePaused,
      j.recurrence_resume_from AS recurrenceResumeFrom,j.last_generated_period AS lastGeneratedPeriod,j.recurrence_started_at AS recurrenceStartedAt,
      j.created_at AS createdAt,c.company AS clientName,m.name AS ownerName,
      GROUP_CONCAT(ja.member_id) AS assignedMemberIds,GROUP_CONCAT(tm.name, ', ') AS assignedMemberNames
      FROM jobs j
      LEFT JOIN clients c ON c.id=j.client_id
      LEFT JOIN team_members m ON m.id=j.owner_id
      LEFT JOIN job_assignments ja ON ja.job_id=j.id
      LEFT JOIN team_members tm ON tm.id=ja.member_id
      GROUP BY j.id
      ORDER BY j.created_at DESC`).all(),
    db.prepare(`SELECT a.id,a.entity_type AS entityType,a.entity_id AS entityId,a.type,a.title,a.body,a.actor_id AS actorId,
      a.created_at AS createdAt,m.name AS actorName
      FROM activities a LEFT JOIN team_members m ON m.id=a.actor_id
      ORDER BY a.created_at DESC LIMIT 500`).all(),
  ]);

  const memberRows = (members.results || []).map((member) => {
    const row = member as Record<string, unknown>;
    const role = String(row.role || "commerciale");
    return {
      ...row,
      permissions: typeof row.permissions === "string" && row.permissions !== "{}"
        ? row.permissions
        : JSON.stringify(permissionsForRole(role)),
    };
  });

  return {
    stages: stages.results,
    members: memberRows,
    leads: leads.results,
    clients: clients.results,
    documents: docs.results,
    tasks: tasks.results,
    payments: payments.results,
    templates: templates.results,
    jobs: jobs.results,
    activities: activities.results,
  };
}
