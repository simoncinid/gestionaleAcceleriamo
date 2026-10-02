import { env } from "cloudflare:workers";

const stageSeed = [
  ["da-chiamare-prima-volta", "Da chiamare prima volta", 10, "orange"], ["non-chiamato", "Non Chiamato", 20, "neutral"],
  ["da-richiamare", "Da Richiamare", 30, "yellow"], ["appuntamento-confermato", "Appuntamento confermato", 40, "blue"],
  ["presentazione-confermata", "Presentazione Confermata", 50, "violet"], ["in-attesa-preventivo", "In Attesa Preventivo", 60, "orange"],
  ["in-attesa-decisione", "In attesa decisione", 70, "yellow"], ["probabilmente-bloccato", "Probabilmente bloccato", 80, "neutral"],
  ["chiuso", "Chiuso", 90, "green"], ["non-chiuso", "Non Chiuso", 100, "red"], ["fuori-target", "Fuori Target", 110, "red"], ["fake", "Fake", 120, "red"],
] as const;

export function getRawDb() { if (!env.DB) throw new Error("Database non disponibile"); return env.DB; }

export async function ensureDefaults(db: D1Database) {
  const count = await db.prepare("SELECT COUNT(*) AS total FROM pipeline_stages").first<{ total: number }>();
  if ((count?.total ?? 0) > 0) return;
  await db.batch([
    ...stageSeed.map((row) => db.prepare("INSERT INTO pipeline_stages (id,label,sort_order,tone) VALUES (?,?,?,?)").bind(...row)),
    db.prepare("INSERT INTO team_members (id,name,initials,color) VALUES (?,?,?,?)").bind("diego", "Diego", "DS", "#ff5a1f"),
    db.prepare("INSERT INTO team_members (id,name,initials,color) VALUES (?,?,?,?)").bind("tommaso", "Tommaso", "TR", "#1d1b19"),
    db.prepare("INSERT INTO job_templates (id,title,description,default_price,default_days,active) VALUES (?,?,?,?,?,1)").bind("tpl-ai", "AI Workmap", "Analisi processi e roadmap operativa AI.", 2400, 21),
    db.prepare("INSERT INTO job_templates (id,title,description,default_price,default_days,active) VALUES (?,?,?,?,?,1)").bind("tpl-automation", "Automazione su misura", "Progettazione e sviluppo di un flusso automatizzato.", 4500, 45),
    db.prepare("INSERT INTO job_templates (id,title,description,default_price,default_days,active) VALUES (?,?,?,?,?,1)").bind("tpl-software", "Software custom", "Applicazione verticale su processi specifici.", 9000, 90),
  ]);
}

export async function readDashboard(db: D1Database) {
  await ensureDefaults(db);
  const [stages, members, leads, clients, docs, tasks, payments, templates, jobs] = await Promise.all([
    db.prepare("SELECT id,label,sort_order AS sortOrder,tone FROM pipeline_stages ORDER BY sort_order").all(),
    db.prepare("SELECT id,name,initials,color FROM team_members ORDER BY name").all(),
    db.prepare("SELECT id,company,contact_name AS contactName,email,phone,status_id AS statusId,estimated_value AS estimatedValue,source,notes,created_at AS createdAt,updated_at AS updatedAt FROM leads ORDER BY updated_at DESC").all(),
    db.prepare("SELECT id,company,contact_name AS contactName,email,phone,lead_id AS leadId,created_at AS createdAt FROM clients ORDER BY created_at DESC").all(),
    db.prepare("SELECT id,lead_id AS leadId,client_id AS clientId,name,content_type AS contentType,size,uploaded_at AS uploadedAt FROM documents ORDER BY uploaded_at DESC").all(),
    db.prepare("SELECT t.id,t.title,t.description,t.assignee_id AS assigneeId,t.lead_id AS leadId,t.client_id AS clientId,t.status,t.priority,t.due_date AS dueDate,t.created_at AS createdAt,m.name AS assigneeName FROM tasks t LEFT JOIN team_members m ON m.id=t.assignee_id ORDER BY CASE WHEN t.status='done' THEN 1 ELSE 0 END, t.due_date").all(),
    db.prepare("SELECT p.id,p.client_id AS clientId,p.description,p.amount,p.status,p.kind,p.recurrence,p.due_date AS dueDate,p.next_issue_at AS nextIssueAt,p.received_at AS receivedAt,p.created_at AS createdAt,c.company AS clientName FROM payments p LEFT JOIN clients c ON c.id=p.client_id ORDER BY COALESCE(p.due_date,p.created_at)").all(),
    db.prepare("SELECT id,title,description,default_price AS defaultPrice,default_days AS defaultDays,active,created_at AS createdAt FROM job_templates ORDER BY created_at DESC").all(),
    db.prepare("SELECT j.id,j.client_id AS clientId,j.template_id AS templateId,j.title,j.status,j.price,j.owner_id AS ownerId,j.start_date AS startDate,j.due_date AS dueDate,j.created_at AS createdAt,c.company AS clientName,m.name AS ownerName FROM jobs j LEFT JOIN clients c ON c.id=j.client_id LEFT JOIN team_members m ON m.id=j.owner_id ORDER BY j.created_at DESC").all(),
  ]);
  return { stages: stages.results, members: members.results, leads: leads.results, clients: clients.results, documents: docs.results, tasks: tasks.results, payments: payments.results, templates: templates.results, jobs: jobs.results };
}
export const uid = () => crypto.randomUUID();
