import { getRawDb, readDashboard, uid } from "@/lib/data";
export const runtime = "edge";

export async function GET() {
  try { return Response.json(await readDashboard(getRawDb())); }
  catch (error) { console.error("dashboard_read_failed", error); return Response.json({ error: "Dati temporaneamente non disponibili." }, { status: 503 }); }
}
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export async function POST(request: Request) {
  const db = getRawDb();
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action);
    if (action === "createLead") {
      const company = text(body.company);
      if (!company) return Response.json({ error: "Inserisci l'azienda." }, { status: 400 });
      await db.prepare("INSERT INTO leads (id,company,contact_name,email,phone,status_id,estimated_value,source,notes) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(uid(), company, text(body.contactName), text(body.email), text(body.phone), text(body.statusId) || "non-chiamato", number(body.estimatedValue), "Manuale", text(body.notes)).run();
    } else if (action === "updateLeadStage") {
      await db.prepare("UPDATE leads SET status_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(text(body.statusId), text(body.id)).run();
    } else if (action === "convertLead") {
      const lead = await db.prepare("SELECT * FROM leads WHERE id=?").bind(text(body.id)).first<Record<string, unknown>>();
      if (!lead) return Response.json({ error: "Lead non trovato." }, { status: 404 });
      const clientId = uid();
      await db.batch([
        db.prepare("INSERT INTO clients (id,company,contact_name,email,phone,lead_id) VALUES (?,?,?,?,?,?)").bind(clientId, lead.company, lead.contact_name, lead.email, lead.phone, lead.id),
        db.prepare("UPDATE leads SET status_id='chiuso', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(lead.id),
      ]);
    } else if (action === "createTask") {
      if (!text(body.title)) return Response.json({ error: "Inserisci il task." }, { status: 400 });
      await db.prepare("INSERT INTO tasks (id,title,description,assignee_id,lead_id,client_id,priority,due_date) VALUES (?,?,?,?,?,?,?,?)")
        .bind(uid(), text(body.title), text(body.description), text(body.assigneeId) || "diego", text(body.leadId) || null, text(body.clientId) || null, text(body.priority) || "media", text(body.dueDate) || null).run();
    } else if (action === "toggleTask") {
      await db.prepare("UPDATE tasks SET status=CASE status WHEN 'done' THEN 'todo' ELSE 'done' END WHERE id=?").bind(text(body.id)).run();
    } else if (action === "createPayment") {
      if (!text(body.clientId) || !text(body.description)) return Response.json({ error: "Cliente e descrizione sono obbligatori." }, { status: 400 });
      await db.prepare("INSERT INTO payments (id,client_id,description,amount,status,kind,recurrence,due_date,next_issue_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(uid(), text(body.clientId), text(body.description), number(body.amount), "due", text(body.kind) || "oneoff", text(body.recurrence) || null, text(body.dueDate) || null, text(body.nextIssueAt) || null).run();
    } else if (action === "markPaymentReceived") {
      await db.prepare("UPDATE payments SET status='received', received_at=CURRENT_TIMESTAMP WHERE id=?").bind(text(body.id)).run();
    } else if (action === "createTemplate") {
      if (!text(body.title)) return Response.json({ error: "Inserisci il nome del lavoro." }, { status: 400 });
      await db.prepare("INSERT INTO job_templates (id,title,description,default_price,default_days,active) VALUES (?,?,?,?,?,1)")
        .bind(uid(), text(body.title), text(body.description), number(body.defaultPrice), Math.max(1, number(body.defaultDays) || 30)).run();
    } else if (action === "assignJob") {
      const template = await db.prepare("SELECT * FROM job_templates WHERE id=?").bind(text(body.templateId)).first<Record<string, unknown>>();
      const title = text(body.title) || text(template?.title);
      if (!text(body.clientId) || !title) return Response.json({ error: "Cliente e lavoro sono obbligatori." }, { status: 400 });
      await db.prepare("INSERT INTO jobs (id,client_id,template_id,title,status,price,owner_id,start_date,due_date) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(uid(), text(body.clientId), text(body.templateId) || null, title, "pianificato", number(body.price) || number(template?.default_price), text(body.ownerId) || "diego", text(body.startDate) || null, text(body.dueDate) || null).run();
    } else return Response.json({ error: "Azione non riconosciuta." }, { status: 400 });
    return Response.json(await readDashboard(db));
  } catch (error) { console.error("dashboard_write_failed", error); return Response.json({ error: "Non è stato possibile salvare. Riprova." }, { status: 500 }); }
}
