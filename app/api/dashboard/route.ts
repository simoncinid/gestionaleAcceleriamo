import {
  completeRecurringTask,
  createJobPayment,
  getRawDb,
  logActivity,
  parseBlueprint,
  parseMemberIds,
  readDashboard,
  replaceJobAssignments,
  spawnJobTasks,
  syncJobAfterTaskChange,
  uid,
} from "@/lib/data";
import { permissionsForRole, ROLE_PRESETS } from "@/lib/permissions";

export const runtime = "edge";

export async function GET() {
  try {
    return Response.json(await readDashboard(getRawDb()));
  } catch (error) {
    console.error("dashboard_read_failed", error);
    return Response.json({ error: "Dati temporaneamente non disponibili." }, { status: 503 });
  }
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const number = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const nullable = (value: unknown) => {
  const v = text(value);
  if (!v || v === "_none") return null;
  return v;
};
const truthy = (value: unknown) => value === true || value === 1 || value === "1" || value === "true" || value === "on";

export async function POST(request: Request) {
  const db = getRawDb();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = text(body.action);
    const actorId = nullable(body.actorId);

    if (action === "createLead") {
      const company = text(body.company);
      if (!company) return Response.json({ error: "Inserisci l'azienda." }, { status: 400 });
      const id = uid();
      await db.prepare(
        `INSERT INTO leads (id,company,contact_name,email,phone,status_id,estimated_value,source,notes,owner_id,appointment_at,meeting_link,proposal_url,call_notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        id,
        company,
        text(body.contactName),
        text(body.email),
        text(body.phone),
        text(body.statusId) || "da-chiamare-prima-volta",
        number(body.estimatedValue),
        text(body.source) || "Manuale",
        text(body.notes),
        nullable(body.ownerId) || actorId,
        nullable(body.appointmentAt),
        text(body.meetingLink),
        text(body.proposalUrl),
        text(body.callNotes),
      ).run();
      await logActivity(db, { entityType: "lead", entityId: id, type: "created", title: "Lead creato", body: `Fonte: ${text(body.source) || "Manuale"}`, actorId });
    } else if (action === "updateLead") {
      const id = text(body.id);
      if (!id) return Response.json({ error: "Lead mancante." }, { status: 400 });
      await db.prepare(
        `UPDATE leads SET company=?, contact_name=?, email=?, phone=?, status_id=?, estimated_value=?, source=?, notes=?,
         owner_id=?, appointment_at=?, meeting_link=?, proposal_url=?, call_notes=?, last_contact_at=COALESCE(?, last_contact_at),
         updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      ).bind(
        text(body.company),
        text(body.contactName),
        text(body.email),
        text(body.phone),
        text(body.statusId),
        number(body.estimatedValue),
        text(body.source) || "Manuale",
        text(body.notes),
        nullable(body.ownerId),
        nullable(body.appointmentAt),
        text(body.meetingLink),
        text(body.proposalUrl),
        text(body.callNotes),
        nullable(body.lastContactAt),
        id,
      ).run();
      await logActivity(db, { entityType: "lead", entityId: id, type: "updated", title: "Lead aggiornato", actorId });
    } else if (action === "updateLeadStage") {
      await db.prepare("UPDATE leads SET status_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(text(body.statusId), text(body.id)).run();
      await logActivity(db, { entityType: "lead", entityId: text(body.id), type: "stage", title: `Fase → ${text(body.statusId)}`, actorId });
    } else if (action === "logCall") {
      const id = text(body.id);
      const outcome = text(body.outcome) || "chiamata";
      const notes = text(body.notes);
      const nextStatus = nullable(body.statusId);
      const lead = await db.prepare("SELECT call_notes FROM leads WHERE id=?").bind(id).first<{ call_notes: string }>();
      if (!lead) return Response.json({ error: "Lead non trovato." }, { status: 404 });
      const stamp = new Date().toLocaleString("it-IT");
      const merged = [lead.call_notes, `[${stamp}] ${outcome}${notes ? ` — ${notes}` : ""}`].filter(Boolean).join("\n");
      if (nextStatus) {
        await db.prepare("UPDATE leads SET call_notes=?, last_contact_at=CURRENT_TIMESTAMP, status_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(merged, nextStatus, id).run();
      } else {
        await db.prepare("UPDATE leads SET call_notes=?, last_contact_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(merged, id).run();
      }
      await logActivity(db, { entityType: "lead", entityId: id, type: "call", title: `Chiamata: ${outcome}`, body: notes, actorId });
    } else if (action === "scheduleMeeting") {
      const id = text(body.id);
      if (!id || !text(body.appointmentAt)) return Response.json({ error: "Data appuntamento obbligatoria." }, { status: 400 });
      await db.prepare(
        "UPDATE leads SET appointment_at=?, meeting_link=?, status_id=COALESCE(NULLIF(?, ''), status_id), updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).bind(text(body.appointmentAt), text(body.meetingLink), text(body.statusId) || "appuntamento-confermato", id).run();
      await logActivity(db, {
        entityType: "lead",
        entityId: id,
        type: "meeting",
        title: "Videocall fissata",
        body: `${text(body.appointmentAt)}${text(body.meetingLink) ? ` · ${text(body.meetingLink)}` : ""}`,
        actorId,
      });
    } else if (action === "setProposal") {
      const id = text(body.id);
      const url = text(body.proposalUrl);
      if (!id || !url) return Response.json({ error: "Link proposta obbligatorio." }, { status: 400 });
      await db.prepare(
        "UPDATE leads SET proposal_url=?, status_id=COALESCE(NULLIF(?, ''), 'in-attesa-decisione'), updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).bind(url, text(body.statusId), id).run();
      // Salva anche come documento link
      await db.prepare(
        "INSERT INTO documents (id,lead_id,client_id,name,object_key,content_type,size,kind,external_url) VALUES (?,?,?,?,?,?,?,?,?)",
      ).bind(uid(), id, null, text(body.name) || "Proposta Figma", "", "text/uri-list", 0, "proposta", url).run();
      await logActivity(db, { entityType: "lead", entityId: id, type: "proposal", title: "Proposta salvata", body: url, actorId });
    } else if (action === "deleteLead") {
      const id = text(body.id);
      await db.batch([
        db.prepare("DELETE FROM documents WHERE lead_id=?").bind(id),
        db.prepare("DELETE FROM tasks WHERE lead_id=?").bind(id),
        db.prepare("DELETE FROM activities WHERE entity_type='lead' AND entity_id=?").bind(id),
        db.prepare("DELETE FROM leads WHERE id=?").bind(id),
      ]);
    } else if (action === "convertLead") {
      const lead = await db.prepare("SELECT * FROM leads WHERE id=?").bind(text(body.id)).first<Record<string, unknown>>();
      if (!lead) return Response.json({ error: "Lead non trovato." }, { status: 404 });
      const clientId = uid();
      const ownerId = text(body.ownerId) || text(lead.owner_id) || actorId || "diego";
      await db.batch([
        db.prepare("INSERT INTO clients (id,company,contact_name,email,phone,lead_id,owner_id,notes,status) VALUES (?,?,?,?,?,?,?,?,?)").bind(
          clientId,
          lead.company,
          lead.contact_name,
          lead.email,
          lead.phone,
          lead.id,
          ownerId,
          lead.notes || "",
          "attivo",
        ),
        db.prepare("UPDATE leads SET status_id='chiuso', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(lead.id),
        db.prepare("UPDATE documents SET client_id=? WHERE lead_id=? AND (client_id IS NULL OR client_id='')").bind(clientId, lead.id),
        db.prepare("UPDATE tasks SET client_id=? WHERE lead_id=? AND (client_id IS NULL OR client_id='')").bind(clientId, lead.id),
      ]);
      await logActivity(db, { entityType: "client", entityId: clientId, type: "converted", title: "Convertito da lead", body: String(lead.company), actorId });
      await logActivity(db, { entityType: "lead", entityId: String(lead.id), type: "converted", title: "Trasformato in cliente", actorId });

      if (body.createJob) {
        const templateId = nullable(body.templateId);
        const template = templateId
          ? await db.prepare("SELECT * FROM job_templates WHERE id=?").bind(templateId).first<Record<string, unknown>>()
          : null;
        const title = text(body.title) || text(template?.title) || `Lavoro ${lead.company}`;
        const jobId = uid();
        const startDate = text(body.startDate) || new Date().toISOString().slice(0, 10);
        const dueDate = text(body.dueDate) || (() => {
          const value = new Date(`${startDate}T00:00:00Z`);
          value.setUTCDate(value.getUTCDate() + Math.max(1, number(template?.default_days) || 30));
          return value.toISOString().slice(0, 10);
        })();
        const recurring = truthy(body.isRecurring) || Number(template?.recurrence_enabled || 0) === 1;
        const recurrenceDay = recurring ? Math.min(31, Math.max(1, number(body.recurrenceDay) || new Date(`${startDate}T00:00:00Z`).getUTCDate())) : null;
        await db.prepare(
          `INSERT INTO jobs (id,client_id,template_id,lead_id,title,status,price,recurring_price,owner_id,notes,start_date,due_date,is_recurring,recurrence_day)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          jobId,
          clientId,
          templateId,
          lead.id,
          title,
          "pianificato",
          number(body.price) || number(template?.default_price),
          number(body.recurringPrice) || number(template?.recurring_price),
          ownerId,
          text(body.notes),
          startDate,
          dueDate,
          recurring ? 1 : 0,
          recurrenceDay,
        ).run();
        await replaceJobAssignments(db, jobId, parseMemberIds(body.assignedMemberIds, ownerId));
        await spawnJobTasks(db, {
          jobId,
          clientId,
          leadId: String(lead.id),
          ownerId,
          startDate,
          blueprintRaw: template?.task_blueprint || "[]",
        });
        const paymentMode = String(template?.payment_recurrence || "oneoff");
        if (Number(template?.payment_enabled || 0) === 1 && (!recurring || ["oneoff", "both"].includes(paymentMode))) {
          await createJobPayment(db, {
            jobId, clientId, title, amount: number(body.price) || number(template?.default_price), dueDate, recurring: false,
          });
        }
        await logActivity(db, { entityType: "job", entityId: jobId, type: "created", title: "Lavoro creato da conversione", body: title, actorId });
        await logActivity(db, { entityType: "client", entityId: clientId, type: "job", title: `Lavoro: ${title}`, actorId });
      }
    } else if (action === "updateClient") {
      const id = text(body.id);
      if (!id || !text(body.company)) return Response.json({ error: "Cliente non valido." }, { status: 400 });
      await db.prepare(
        "UPDATE clients SET company=?, contact_name=?, email=?, phone=?, owner_id=?, notes=?, status=? WHERE id=?",
      ).bind(
        text(body.company),
        text(body.contactName),
        text(body.email),
        text(body.phone),
        nullable(body.ownerId),
        text(body.notes),
        text(body.status) || "attivo",
        id,
      ).run();
      await logActivity(db, { entityType: "client", entityId: id, type: "updated", title: "Scheda cliente aggiornata", actorId });
    } else if (action === "deleteClient") {
      const id = text(body.id);
      const jobs = await db.prepare("SELECT id FROM jobs WHERE client_id=?").bind(id).all<{ id: string }>();
      const jobIds = jobs.results?.map((j) => j.id) || [];
      const batch = [
        db.prepare("DELETE FROM payments WHERE client_id=?").bind(id),
        db.prepare("DELETE FROM documents WHERE client_id=?").bind(id),
        db.prepare("DELETE FROM tasks WHERE client_id=?").bind(id),
        db.prepare("DELETE FROM jobs WHERE client_id=?").bind(id),
        db.prepare("DELETE FROM activities WHERE entity_type='client' AND entity_id=?").bind(id),
        db.prepare("DELETE FROM clients WHERE id=?").bind(id),
      ];
      for (const jobId of jobIds) {
        batch.push(db.prepare("DELETE FROM job_assignments WHERE job_id=?").bind(jobId));
        batch.push(db.prepare("DELETE FROM activities WHERE entity_type='job' AND entity_id=?").bind(jobId));
      }
      await db.batch(batch);
    } else if (action === "createTask") {
      if (!text(body.title)) return Response.json({ error: "Inserisci il task." }, { status: 400 });
      const kind = text(body.kind) || "oneoff";
      const due = nullable(body.dueDate);
      await db.prepare(
        "INSERT INTO tasks (id,title,description,assignee_id,lead_id,client_id,job_id,priority,kind,recurrence,next_due_at,due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      ).bind(
        uid(),
        text(body.title),
        text(body.description),
        text(body.assigneeId) || "diego",
        nullable(body.leadId),
        nullable(body.clientId),
        nullable(body.jobId),
        text(body.priority) || "media",
        kind,
        kind === "recurring" ? text(body.recurrence) || "mensile" : null,
        kind === "recurring" ? due : null,
        due,
      ).run();
    } else if (action === "updateTask") {
      const id = text(body.id);
      if (!id || !text(body.title)) return Response.json({ error: "Task non valido." }, { status: 400 });
      const kind = text(body.kind) || "oneoff";
      await db.prepare(
        "UPDATE tasks SET title=?, description=?, assignee_id=?, lead_id=?, client_id=?, job_id=?, priority=?, kind=?, recurrence=?, next_due_at=?, visible_from=?, due_date=?, status=? WHERE id=?",
      ).bind(
        text(body.title),
        text(body.description),
        text(body.assigneeId) || "diego",
        nullable(body.leadId),
        nullable(body.clientId),
        nullable(body.jobId),
        text(body.priority) || "media",
        kind,
        kind === "recurring" ? text(body.recurrence) || "mensile" : null,
        kind === "recurring" ? nullable(body.dueDate) : null,
        nullable(body.dueDate),
        nullable(body.dueDate),
        text(body.status) || "todo",
        id,
      ).run();
      if (nullable(body.jobId)) await syncJobAfterTaskChange(db, String(nullable(body.jobId)));
    } else if (action === "toggleTask") {
      await completeRecurringTask(db, text(body.id));
    } else if (action === "deleteTask") {
      const task = await db.prepare("SELECT job_id FROM tasks WHERE id=?").bind(text(body.id)).first<{ job_id: string | null }>();
      await db.prepare("DELETE FROM tasks WHERE id=?").bind(text(body.id)).run();
      if (task?.job_id) await syncJobAfterTaskChange(db, task.job_id, true);
    } else if (action === "createPayment") {
      if (!text(body.clientId) || !text(body.description)) return Response.json({ error: "Cliente e descrizione sono obbligatori." }, { status: 400 });
      const paymentId = uid();
      const recurring = text(body.kind) === "recurring";
      await db.prepare(
        "INSERT INTO payments (id,client_id,series_id,description,amount,status,kind,recurrence,due_date,next_issue_at) VALUES (?,?,?,?,?,'due',?,?,?,?)",
      ).bind(
        paymentId,
        text(body.clientId),
        recurring ? paymentId : null,
        text(body.description),
        number(body.amount),
        text(body.kind) || "oneoff",
        text(body.recurrence) || null,
        nullable(body.dueDate),
        nullable(body.nextIssueAt),
      ).run();
    } else if (action === "markPaymentReceived") {
      const payment = await db.prepare("SELECT * FROM payments WHERE id=?").bind(text(body.id)).first<Record<string, unknown>>();
      if (!payment) return Response.json({ error: "Pagamento non trovato." }, { status: 404 });
      await db.prepare("UPDATE payments SET status='received', received_at=CURRENT_TIMESTAMP WHERE id=?").bind(text(body.id)).run();
      if (payment.kind === "recurring" && !payment.job_id) {
        const recurrence = String(payment.recurrence || "mensile");
        const base = payment.next_issue_at || payment.due_date || new Date().toISOString().slice(0, 10);
        const next = new Date(String(base));
        if (recurrence === "giornaliera") next.setDate(next.getDate() + 1);
        else if (recurrence === "settimanale") next.setDate(next.getDate() + 7);
        else if (recurrence === "trimestrale") next.setMonth(next.getMonth() + 3);
        else if (recurrence === "annuale") next.setFullYear(next.getFullYear() + 1);
        else next.setMonth(next.getMonth() + 1);
        const nextIso = next.toISOString().slice(0, 10);
        await db.prepare(
          "INSERT INTO payments (id,client_id,series_id,description,amount,status,kind,recurrence,due_date,next_issue_at) VALUES (?,?,?,?,?,'due','recurring',?,?,?)",
        ).bind(uid(), payment.client_id, payment.series_id || payment.id, payment.description, payment.amount, recurrence, nextIso, nextIso).run();
      }
      await logActivity(db, { entityType: "client", entityId: String(payment.client_id), type: "payment", title: "Pagamento ricevuto", body: String(payment.description), actorId });
    } else if (action === "deletePayment") {
      const payment = await db.prepare("SELECT * FROM payments WHERE id=?").bind(text(body.id)).first<Record<string, unknown>>();
      if (payment?.kind === "recurring") {
        if (payment.series_id) {
          await db.prepare("DELETE FROM payments WHERE series_id=? AND status='due'").bind(payment.series_id).run();
        } else {
          // Compatibilità per le ricorrenze create prima dell'introduzione dell'id serie.
          await db.prepare(`DELETE FROM payments WHERE client_id=? AND description=? AND kind='recurring' AND status='due'`)
            .bind(payment.client_id, payment.description).run();
        }
        await db.prepare("DELETE FROM payments WHERE id=?").bind(text(body.id)).run();
      } else {
        await db.prepare("DELETE FROM payments WHERE id=?").bind(text(body.id)).run();
      }
    } else if (action === "createTemplate") {
      if (!text(body.title)) return Response.json({ error: "Inserisci il nome del lavoro." }, { status: 400 });
      const blueprint = JSON.stringify(parseBlueprint(text(body.taskBlueprint) || "[]"));
      const recurringBlueprint = JSON.stringify(parseBlueprint(text(body.recurringTaskBlueprint) || "[]"));
      await db.prepare(
        `INSERT INTO job_templates
        (id,title,description,default_price,recurring_price,default_days,task_blueprint,recurring_task_blueprint,recurrence_enabled,payment_enabled,payment_recurrence,active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
      ).bind(
        uid(), text(body.title), text(body.description), number(body.defaultPrice), number(body.recurringPrice), Math.max(1, number(body.defaultDays) || 30),
        blueprint, recurringBlueprint, truthy(body.recurrenceEnabled) ? 1 : 0, truthy(body.paymentEnabled) ? 1 : 0,
        text(body.paymentRecurrence) || "oneoff",
      ).run();
    } else if (action === "updateTemplate") {
      const id = text(body.id);
      if (!id || !text(body.title)) return Response.json({ error: "Modello non valido." }, { status: 400 });
      const blueprint = JSON.stringify(parseBlueprint(text(body.taskBlueprint) || "[]"));
      const recurringBlueprint = JSON.stringify(parseBlueprint(text(body.recurringTaskBlueprint) || "[]"));
      await db.prepare(
        `UPDATE job_templates SET title=?,description=?,default_price=?,recurring_price=?,default_days=?,task_blueprint=?,recurring_task_blueprint=?,
         recurrence_enabled=?,payment_enabled=?,payment_recurrence=?,active=? WHERE id=?`,
      ).bind(
        text(body.title),
        text(body.description),
        number(body.defaultPrice),
        number(body.recurringPrice),
        Math.max(1, number(body.defaultDays) || 30),
        blueprint,
        recurringBlueprint,
        truthy(body.recurrenceEnabled) ? 1 : 0,
        truthy(body.paymentEnabled) ? 1 : 0,
        text(body.paymentRecurrence) || "oneoff",
        body.active === false || body.active === 0 || body.active === "0" ? 0 : 1,
        id,
      ).run();
    } else if (action === "deleteTemplate") {
      const id = text(body.id);
      const inUse = await db.prepare("SELECT COUNT(*) AS total FROM jobs WHERE template_id=?").bind(id).first<{ total: number }>();
      if ((inUse?.total || 0) > 0) return Response.json({ error: "Il modello è usato da uno o più lavori e non può essere eliminato." }, { status: 400 });
      await db.prepare("DELETE FROM job_templates WHERE id=?").bind(id).run();
    } else if (action === "assignJob" || action === "createJob") {
      const templateId = nullable(body.templateId);
      const template = templateId
        ? await db.prepare("SELECT * FROM job_templates WHERE id=?").bind(templateId).first<Record<string, unknown>>()
        : null;
      const title = text(body.title) || text(template?.title);
      if (!text(body.clientId) || !title) return Response.json({ error: "Cliente e lavoro sono obbligatori." }, { status: 400 });
      const jobId = uid();
      const ownerId = text(body.ownerId) || "diego";
      const startDate = nullable(body.startDate) || new Date().toISOString().slice(0, 10);
      const recurrenceEnabled = truthy(body.isRecurring) || Number(template?.recurrence_enabled || 0) === 1;
      const recurrenceDay = recurrenceEnabled ? Math.min(31, Math.max(1, number(body.recurrenceDay) || new Date(`${startDate}T00:00:00Z`).getUTCDate() || 1)) : null;
      const memberIds = parseMemberIds(body.assignedMemberIds, ownerId);
      const dueDate = nullable(body.dueDate) || (() => {
        const value = new Date(`${startDate}T00:00:00Z`);
        value.setUTCDate(value.getUTCDate() + Math.max(1, number(template?.default_days) || 30));
        return value.toISOString().slice(0, 10);
      })();
      await db.prepare(
        `INSERT INTO jobs (id,client_id,template_id,lead_id,title,status,price,recurring_price,owner_id,notes,start_date,due_date,is_recurring,recurrence_day)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        jobId,
        text(body.clientId),
        templateId,
        nullable(body.leadId),
        title,
        text(body.status) || "pianificato",
        number(body.price) || number(template?.default_price),
        number(body.recurringPrice) || number(template?.recurring_price),
        ownerId,
        text(body.notes),
        startDate,
        dueDate,
        recurrenceEnabled ? 1 : 0,
        recurrenceDay,
      ).run();
      await replaceJobAssignments(db, jobId, memberIds);
      if (body.spawnTasks !== false) {
        await spawnJobTasks(db, {
          jobId,
          clientId: text(body.clientId),
          leadId: nullable(body.leadId),
          ownerId,
          startDate,
          blueprintRaw: template?.task_blueprint || "[]",
        });
      }
      const paymentMode = String(template?.payment_recurrence || "oneoff");
      if (Number(template?.payment_enabled || 0) === 1 && (!recurrenceEnabled || ["oneoff", "both"].includes(paymentMode))) {
        await createJobPayment(db, {
          jobId,
          clientId: text(body.clientId),
          title,
          amount: number(body.price) || number(template?.default_price),
          dueDate,
          recurring: false,
        });
      }
      await logActivity(db, { entityType: "job", entityId: jobId, type: "created", title: "Lavoro creato", body: title, actorId });
      await logActivity(db, { entityType: "client", entityId: text(body.clientId), type: "job", title: `Lavoro: ${title}`, actorId });
    } else if (action === "updateJob") {
      const id = text(body.id);
      if (!id || !text(body.title)) return Response.json({ error: "Lavoro non valido." }, { status: 400 });
      await db.prepare(
        `UPDATE jobs SET client_id=?,title=?,status=?,price=?,recurring_price=?,owner_id=?,notes=?,start_date=?,due_date=?,
         is_recurring=?,recurrence_day=? WHERE id=?`,
      ).bind(
        text(body.clientId),
        text(body.title),
        text(body.status) || "pianificato",
        number(body.price),
        number(body.recurringPrice),
        text(body.ownerId) || "diego",
        text(body.notes),
        nullable(body.startDate),
        nullable(body.dueDate),
        truthy(body.isRecurring) ? 1 : 0,
        truthy(body.isRecurring) ? Math.min(31, Math.max(1, number(body.recurrenceDay) || 1)) : null,
        id,
      ).run();
      await replaceJobAssignments(db, id, parseMemberIds(body.assignedMemberIds, text(body.ownerId) || "diego"));
      await db.prepare("UPDATE payments SET client_id=?,description=?,amount=?,due_date=? WHERE job_id=? AND status='due'")
        .bind(text(body.clientId), text(body.title), number(body.price), nullable(body.dueDate), id).run();
      await logActivity(db, { entityType: "job", entityId: id, type: "updated", title: `Lavoro aggiornato (${text(body.status) || "—"})`, actorId });
    } else if (action === "pauseJobRecurrence") {
      const id = text(body.id);
      const job = await db.prepare("SELECT is_recurring,parent_job_id FROM jobs WHERE id=?").bind(id).first<Record<string, unknown>>();
      if (!job || Number(job.is_recurring || 0) !== 1 || job.parent_job_id) return Response.json({ error: "Puoi mettere in pausa solo un lavoro ricorrente principale." }, { status: 400 });
      await db.prepare("UPDATE jobs SET recurrence_paused=1,recurrence_resume_from=NULL WHERE id=?").bind(id).run();
      await logActivity(db, { entityType: "job", entityId: id, type: "paused", title: "Ricorrenza messa in pausa", actorId });
    } else if (action === "resumeJobRecurrence") {
      const id = text(body.id);
      if (!nullable(body.recurrenceResumeFrom)) return Response.json({ error: "Indica da quale data riprendere." }, { status: 400 });
      await db.prepare("UPDATE jobs SET recurrence_paused=0,recurrence_resume_from=? WHERE id=?").bind(nullable(body.recurrenceResumeFrom), id).run();
      await logActivity(db, { entityType: "job", entityId: id, type: "resumed", title: `Ricorrenza ripresa dal ${text(body.recurrenceResumeFrom)}`, actorId });
    } else if (action === "deleteJob") {
      const id = text(body.id);
      const children = await db.prepare("SELECT id FROM jobs WHERE parent_job_id=?").bind(id).all<{ id: string }>();
      const ids = [id, ...(children.results || []).map((row) => row.id)];
      const deletions = ids.flatMap((jobId) => [
        db.prepare("DELETE FROM payments WHERE job_id=?").bind(jobId),
        db.prepare("DELETE FROM tasks WHERE job_id=?").bind(jobId),
        db.prepare("DELETE FROM job_assignments WHERE job_id=?").bind(jobId),
        db.prepare("DELETE FROM activities WHERE entity_type='job' AND entity_id=?").bind(jobId),
      ]);
      await db.batch([
        ...deletions,
        db.prepare("DELETE FROM jobs WHERE parent_job_id=?").bind(id),
        db.prepare("DELETE FROM activities WHERE entity_type='job' AND entity_id=?").bind(id),
        db.prepare("DELETE FROM jobs WHERE id=?").bind(id),
      ]);
    } else if (action === "createMember") {
      const name = text(body.name);
      if (!name) return Response.json({ error: "Nome obbligatorio." }, { status: 400 });
      const role = text(body.role) || "commerciale";
      const initials = text(body.initials) || name.slice(0, 2).toUpperCase();
      const perms = text(body.permissions) || JSON.stringify(permissionsForRole(role));
      await db.prepare(
        "INSERT INTO team_members (id,name,initials,color,email,role,permissions,active) VALUES (?,?,?,?,?,?,?,1)",
      ).bind(uid(), name, initials, text(body.color) || "#397ba8", text(body.email), role, perms).run();
    } else if (action === "updateMember") {
      const id = text(body.id);
      if (!id || !text(body.name)) return Response.json({ error: "Membro non valido." }, { status: 400 });
      const role = text(body.role) || "commerciale";
      const perms = text(body.permissions) || JSON.stringify(ROLE_PRESETS[role as keyof typeof ROLE_PRESETS] || permissionsForRole(role));
      await db.prepare(
        "UPDATE team_members SET name=?, initials=?, color=?, email=?, role=?, permissions=?, active=? WHERE id=?",
      ).bind(
        text(body.name),
        text(body.initials) || text(body.name).slice(0, 2).toUpperCase(),
        text(body.color) || "#397ba8",
        text(body.email),
        role,
        perms,
        body.active === false || body.active === 0 || body.active === "0" ? 0 : 1,
        id,
      ).run();
    } else if (action === "deleteMember") {
      const id = text(body.id);
      if (id === "diego") return Response.json({ error: "Non puoi rimuovere l'account principale." }, { status: 400 });
      const inUse = await db.prepare(`SELECT
        (SELECT COUNT(*) FROM tasks WHERE assignee_id=?) +
        (SELECT COUNT(*) FROM jobs WHERE owner_id=?) +
        (SELECT COUNT(*) FROM job_assignments WHERE member_id=?) AS total`).bind(id, id, id).first<{ total: number }>();
      if ((inUse?.total ?? 0) > 0) {
        await db.prepare("UPDATE team_members SET active=0 WHERE id=?").bind(id).run();
      } else {
        await db.prepare("DELETE FROM team_members WHERE id=?").bind(id).run();
      }
    } else if (action === "deleteDocument") {
      await db.prepare("DELETE FROM documents WHERE id=?").bind(text(body.id)).run();
    } else if (action === "addNote") {
      const entityType = text(body.entityType);
      const entityId = text(body.entityId);
      const title = text(body.title) || "Nota";
      const note = text(body.body);
      if (!entityType || !entityId || !note) return Response.json({ error: "Nota incompleta." }, { status: 400 });
      await logActivity(db, { entityType, entityId, type: "note", title, body: note, actorId });
    } else {
      return Response.json({ error: "Azione non riconosciuta." }, { status: 400 });
    }

    return Response.json(await readDashboard(db));
  } catch (error) {
    console.error("dashboard_write_failed", error);
    return Response.json({ error: "Non è stato possibile salvare. Riprova." }, { status: 500 });
  }
}
