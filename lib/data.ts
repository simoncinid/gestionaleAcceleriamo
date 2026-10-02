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
  assigneeRole?: string;
};

export const DEFAULT_TASK_BLUEPRINT: TaskBlueprintItem[] = [
  { title: "Onboarding cliente", description: "Kickoff, accessi, brief e obiettivi.", priority: "alta", offsetDays: 0 },
  { title: "Allineamento con sviluppatore", description: "Passaggio operativo e vincoli tecnici.", priority: "alta", offsetDays: 2 },
  { title: "Revisione 1.0", description: "Prima delivery interna/cliente.", priority: "media", offsetDays: 14 },
  { title: "Modifiche", description: "Iterazione sulle feedback ricevuti.", priority: "media", offsetDays: 21 },
  { title: "Revisione finale", description: "Check qualità e checklist chiusura.", priority: "alta", offsetDays: 28 },
  { title: "Consegna e collaudo", description: "Go-live, collaudo e handoff.", priority: "alta", offsetDays: 35 },
  { title: "Invia fattura", description: "Emissione fattura ricorrente / saldo.", priority: "media", offsetDays: 7, kind: "recurring", recurrence: "mensile" },
];

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

  await addColumn(db, "job_templates", "task_blueprint", "task_blueprint text DEFAULT '[]' NOT NULL");

  await addColumn(db, "jobs", "lead_id", "lead_id text");
  await addColumn(db, "jobs", "notes", "notes text DEFAULT '' NOT NULL");
}

export async function ensureDefaults(db: D1Database) {
  await ensureSchema(db);
  const count = await db.prepare("SELECT COUNT(*) AS total FROM pipeline_stages").first<{ total: number }>();
  if ((count?.total ?? 0) === 0) {
    const adminPerms = JSON.stringify(ROLE_PRESETS.admin);
    const commercialPerms = JSON.stringify(ROLE_PRESETS.commerciale);
    const blueprint = JSON.stringify(DEFAULT_TASK_BLUEPRINT);
    await db.batch([
      ...stageSeed.map((row) => db.prepare("INSERT INTO pipeline_stages (id,label,sort_order,tone) VALUES (?,?,?,?)").bind(...row)),
      db.prepare("INSERT INTO team_members (id,name,initials,color,email,role,permissions,active) VALUES (?,?,?,?,?,?,?,1)")
        .bind("diego", "Diego", "DS", "#ff5a1f", "diego@acceleriamo.it", "admin", adminPerms),
      db.prepare("INSERT INTO team_members (id,name,initials,color,email,role,permissions,active) VALUES (?,?,?,?,?,?,?,1)")
        .bind("tommaso", "Tommaso", "TR", "#1d1b19", "tommaso@acceleriamo.it", "commerciale", commercialPerms),
      db.prepare("INSERT INTO job_templates (id,title,description,default_price,default_days,task_blueprint,active) VALUES (?,?,?,?,?,?,1)")
        .bind("tpl-ai", "AI Workmap", "Analisi processi e roadmap operativa AI.", 2400, 21, blueprint),
      db.prepare("INSERT INTO job_templates (id,title,description,default_price,default_days,task_blueprint,active) VALUES (?,?,?,?,?,?,1)")
        .bind("tpl-automation", "Automazione su misura", "Progettazione e sviluppo di un flusso automatizzato.", 4500, 45, blueprint),
      db.prepare("INSERT INTO job_templates (id,title,description,default_price,default_days,task_blueprint,active) VALUES (?,?,?,?,?,?,1)")
        .bind("tpl-software", "Software custom", "Applicazione verticale su processi specifici.", 9000, 90, blueprint),
    ]);
    return;
  }

  // Migrazione soft: ruoli/blueprint sui seed esistenti
  const diego = await db.prepare("SELECT role,permissions FROM team_members WHERE id='diego'").first<{ role: string; permissions: string }>();
  if (diego && (!diego.role || diego.role === "commerciale") && (!diego.permissions || diego.permissions === "{}")) {
    await db.prepare("UPDATE team_members SET role=?, permissions=? WHERE id='diego'")
      .bind("admin", JSON.stringify(ROLE_PRESETS.admin)).run();
  }
  const emptyBlueprints = await db.prepare("SELECT id FROM job_templates WHERE task_blueprint IS NULL OR task_blueprint='' OR task_blueprint='[]'").all<{ id: string }>();
  if (emptyBlueprints.results?.length) {
    const blueprint = JSON.stringify(DEFAULT_TASK_BLUEPRINT);
    await db.batch(emptyBlueprints.results.map((row) =>
      db.prepare("UPDATE job_templates SET task_blueprint=? WHERE id=?").bind(blueprint, row.id),
    ));
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
  if (typeof raw !== "string" || !raw.trim()) return DEFAULT_TASK_BLUEPRINT;
  try {
    const parsed = JSON.parse(raw) as TaskBlueprintItem[];
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_TASK_BLUEPRINT;
  } catch {
    return DEFAULT_TASK_BLUEPRINT;
  }
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
    const due = addDays(input.startDate, item.offsetDays ?? 0);
    const kind = item.kind === "recurring" ? "recurring" : "oneoff";
    return db.prepare(
      "INSERT INTO tasks (id,title,description,assignee_id,lead_id,client_id,job_id,priority,kind,recurrence,next_due_at,due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      uid(),
      item.title,
      item.description || "",
      input.ownerId,
      input.leadId || null,
      input.clientId,
      input.jobId,
      item.priority || "media",
      kind,
      kind === "recurring" ? (item.recurrence || "mensile") : null,
      kind === "recurring" ? due : null,
      due,
    );
  });
  if (statements.length) await db.batch(statements);
}

export async function completeRecurringTask(db: D1Database, taskId: string) {
  const task = await db.prepare("SELECT * FROM tasks WHERE id=?").bind(taskId).first<Record<string, unknown>>();
  if (!task) return;
  if (task.kind !== "recurring") {
    await db.prepare("UPDATE tasks SET status=CASE status WHEN 'done' THEN 'todo' ELSE 'done' END WHERE id=?").bind(taskId).run();
    return;
  }
  // Completare un ricorrente: marca done la corrente e crea la prossima
  const recurrence = String(task.recurrence || "mensile");
  const base = task.next_due_at || task.due_date || new Date().toISOString().slice(0, 10);
  const next = new Date(String(base));
  if (recurrence === "trimestrale") next.setMonth(next.getMonth() + 3);
  else if (recurrence === "annuale") next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  const nextIso = next.toISOString().slice(0, 10);
  await db.batch([
    db.prepare("UPDATE tasks SET status='done' WHERE id=?").bind(taskId),
    db.prepare(
      "INSERT INTO tasks (id,title,description,assignee_id,lead_id,client_id,job_id,priority,kind,recurrence,next_due_at,due_date,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'todo')",
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
    ),
  ]);
}

export async function readDashboard(db: D1Database) {
  await ensureDefaults(db);
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
      t.status,t.priority,t.kind,t.recurrence,t.next_due_at AS nextDueAt,t.due_date AS dueDate,t.created_at AS createdAt,
      m.name AS assigneeName,j.title AS jobTitle,c.company AS clientName
      FROM tasks t
      LEFT JOIN team_members m ON m.id=t.assignee_id
      LEFT JOIN jobs j ON j.id=t.job_id
      LEFT JOIN clients c ON c.id=t.client_id
      ORDER BY CASE WHEN t.status='done' THEN 1 ELSE 0 END, COALESCE(t.due_date,t.next_due_at)`).all(),
    db.prepare(`SELECT p.id,p.client_id AS clientId,p.description,p.amount,p.status,p.kind,p.recurrence,p.due_date AS dueDate,
      p.next_issue_at AS nextIssueAt,p.received_at AS receivedAt,p.created_at AS createdAt,c.company AS clientName
      FROM payments p LEFT JOIN clients c ON c.id=p.client_id ORDER BY COALESCE(p.due_date,p.created_at)`).all(),
    db.prepare(`SELECT id,title,description,default_price AS defaultPrice,default_days AS defaultDays,task_blueprint AS taskBlueprint,active,created_at AS createdAt
      FROM job_templates ORDER BY created_at DESC`).all(),
    db.prepare(`SELECT j.id,j.client_id AS clientId,j.template_id AS templateId,j.lead_id AS leadId,j.title,j.status,j.price,j.owner_id AS ownerId,
      j.notes,j.start_date AS startDate,j.due_date AS dueDate,j.created_at AS createdAt,c.company AS clientName,m.name AS ownerName
      FROM jobs j
      LEFT JOIN clients c ON c.id=j.client_id
      LEFT JOIN team_members m ON m.id=j.owner_id
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
