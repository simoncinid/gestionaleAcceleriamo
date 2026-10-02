"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { can, DOC_KINDS, JOB_STATUSES, LEAD_SOURCES, parsePermissions, ROLE_LABELS, ROLE_PRESETS, type Permissions, type Role } from "@/lib/permissions";
import { Toaster, toast } from "sonner";

type Row = Record<string, string | number | boolean | null>;
type DashboardData = {
  stages: Row[]; members: Row[]; leads: Row[]; clients: Row[]; documents: Row[];
  tasks: Row[]; payments: Row[]; templates: Row[]; jobs: Row[]; activities: Row[];
};
type Section = "dashboard" | "leads" | "clients" | "tasks" | "finance" | "jobs" | "team";
type Modal =
  | "lead" | "task" | "payment" | "template" | "job" | "document" | "member"
  | "convert" | "call" | "meeting" | "proposal" | "editJob" | "editLead" | "editClient" | "editMember" | "note"
  | null;

const pipeline = [
  ["da-chiamare-prima-volta", "Da chiamare prima volta", "orange"], ["non-chiamato", "Non Chiamato", "neutral"],
  ["da-richiamare", "Da Richiamare", "yellow"], ["appuntamento-confermato", "Appuntamento confermato", "blue"],
  ["presentazione-confermata", "Presentazione Confermata", "violet"], ["in-attesa-preventivo", "In Attesa Preventivo", "orange"],
  ["in-attesa-decisione", "In attesa decisione", "yellow"], ["probabilmente-bloccato", "Probabilmente bloccato", "neutral"],
  ["chiuso", "Chiuso", "green"], ["non-chiuso", "Non Chiuso", "red"], ["fuori-target", "Fuori Target", "red"], ["fake", "Fake", "red"],
];
const initialData: DashboardData = {
  stages: pipeline.map(([id, label, tone], sortOrder) => ({ id, label, tone, sortOrder })),
  members: [], leads: [], clients: [], documents: [], tasks: [], payments: [], templates: [], jobs: [], activities: [],
};
const nav: { id: Section; label: string; icon: string }[] = [
  { id: "dashboard", label: "Panoramica", icon: "/icons/jobs.png" },
  { id: "leads", label: "Lead", icon: "/icons/leads.png" },
  { id: "clients", label: "Clienti", icon: "/icons/clients.png" },
  { id: "tasks", label: "Task", icon: "/icons/tasks.png" },
  { id: "finance", label: "Pagamenti", icon: "/icons/finance.png" },
  { id: "jobs", label: "Lavori", icon: "/icons/jobs.png" },
  { id: "team", label: "Team", icon: "/icons/clients.png" },
];
const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const date = (value: unknown) => value ? new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(String(value))) : "—";
const datetime = (value: unknown) => value ? new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(String(value))) : "—";
const kindLabel = (kind: unknown) => DOC_KINDS.find((k) => k.id === kind)?.label || String(kind || "Altro");
const jobTone = (status: unknown) => JOB_STATUSES.find((s) => s.id === status)?.tone || "neutral";
const jobLabel = (status: unknown) => JOB_STATUSES.find((s) => s.id === status)?.label || String(status || "—");

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
function Empty({ title, copy }: { title: string; copy: string }) {
  return <div className="empty"><span className="empty__orb" /><strong>{title}</strong><p>{copy}</p></div>;
}

export default function Home() {
  const [data, setData] = useState<DashboardData>(initialData);
  const [section, setSection] = useState<Section>("dashboard");
  const [modal, setModal] = useState<Modal>(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [currentUserId, setCurrentUserId] = useState(() => {
    if (typeof window === "undefined") return "diego";
    return localStorage.getItem("acceleriamo-user") || "diego";
  });
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [docDefaults, setDocDefaults] = useState<{ leadId?: string; clientId?: string; kind?: string }>({});

  function syncUser(members: Row[], preferred: string) {
    if (!members.length) return preferred;
    if (members.some((m) => m.id === preferred && m.active !== false && m.active !== 0)) return preferred;
    const first = members.find((m) => m.active !== false && m.active !== 0) || members[0];
    return String(first.id);
  }

  async function refresh() {
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error();
      const next = await res.json() as DashboardData;
      setData(next);
      setCurrentUserId((prev) => syncUser(next.members, prev));
    } catch {
      toast.error("Connessione ai dati non disponibile");
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => { void refresh(); }, []);

  const currentUser = data.members.find((m) => m.id === currentUserId) || data.members[0];
  const perms: Permissions = useMemo(
    () => parsePermissions(currentUser?.permissions, String(currentUser?.role || "admin")),
    [currentUser],
  );

  async function act(payload: Record<string, unknown>, success?: string) {
    setPending(true);
    try {
      const res = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, actorId: currentUserId }),
      });
      const next = await res.json() as DashboardData & { error?: string };
      if (!res.ok) throw new Error(next.error || "Errore di salvataggio");
      setData(next);
      setCurrentUserId((prev) => syncUser(next.members, prev));
      setModal(null);
      setEditing(null);
      if (success) toast.success(success);
      return next;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore di salvataggio");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>, action: string, success: string, extra: Record<string, unknown> = {}) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await act({ action, ...values, ...extra }, success);
  }

  useEffect(() => {
    const doc = document as Document & { modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> } };
    if (!doc.modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void doc.modelContext.registerTool({
      name: "create_lead",
      title: "Crea lead",
      description: "Crea un nuovo lead nel gestionale Acceleriamo (anche da Meta Ads).",
      inputSchema: { type: "object", properties: { company: { type: "string" }, contactName: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, source: { type: "string" } }, required: ["company"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => act({ action: "createLead", ...(input as Record<string, unknown>) }, "Lead creato"),
    }, { signal: lifecycle.signal });
    void doc.modelContext.registerTool({
      name: "list_open_tasks",
      title: "Elenca task aperti",
      description: "Restituisce i task ancora da completare.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async () => data.tasks.filter((task) => task.status !== "done").map(({ id, title, dueDate, assigneeName }) => ({ id, title, dueDate, assigneeName })),
    }, { signal: lifecycle.signal });
    return () => lifecycle.abort();
  }, [data.tasks, currentUserId]);

  const stageMap = useMemo(() => new Map(data.stages.map((stage) => [stage.id, stage])), [data.stages]);
  const q = query.trim().toLowerCase();
  const match = (row: Row, keys: string[]) => !q || keys.some((key) => String(row[key] || "").toLowerCase().includes(q));
  const filteredLeads = data.leads.filter((lead) => match(lead, ["company", "contactName", "email", "phone", "source", "notes"]));
  const filteredClients = data.clients.filter((client) => match(client, ["company", "contactName", "email", "phone", "notes"]));
  const filteredTasks = data.tasks.filter((task) => match(task, ["title", "description", "assigneeName", "clientName", "jobTitle"]));
  const filteredJobs = data.jobs.filter((job) => match(job, ["title", "clientName", "ownerName", "status", "notes"]));
  const activeLeads = data.leads.filter((lead) => !["chiuso", "non-chiuso", "fuori-target", "fake"].includes(String(lead.statusId)));
  const openTasks = data.tasks.filter((task) => task.status !== "done");
  const dueTotal = data.payments.filter((payment) => payment.status === "due").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const receivedTotal = data.payments.filter((payment) => payment.status === "received").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const selectedLead = data.leads.find((l) => l.id === selectedLeadId) || null;
  const selectedClient = data.clients.find((c) => c.id === selectedClientId) || null;

  function openNew() {
    if (section === "tasks") setModal("task");
    else if (section === "finance") setModal("payment");
    else if (section === "jobs") setModal("job");
    else if (section === "team") setModal("member");
    else if (section === "clients") { setDocDefaults({}); setModal("document"); }
    else setModal("lead");
  }

  function openDocument(defaults: { leadId?: string; clientId?: string; kind?: string } = {}) {
    setDocDefaults(defaults);
    setModal("document");
  }

  const visibleNav = nav.filter((item) => {
    if (item.id === "dashboard") return true;
    if (item.id === "leads") return can(perms, "leads");
    if (item.id === "clients") return can(perms, "clients");
    if (item.id === "tasks") return can(perms, "tasks");
    if (item.id === "finance") return can(perms, "finance");
    if (item.id === "jobs") return can(perms, "jobs");
    if (item.id === "team") return can(perms, "team");
    return true;
  });

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setSection("dashboard")} aria-label="Apri la panoramica">
        <img src="/brand/acceleriamo-logo.png" alt="ACCELERIAMO" />
      </button>
      <nav aria-label="Navigazione principale">
        {visibleNav.map((item) => (
          <button key={item.id} className={section === item.id ? "nav-item is-active" : "nav-item"} onClick={() => setSection(item.id)}>
            <img src={item.icon} alt="" /><span>{item.label}</span>
            {item.id === "tasks" && openTasks.length > 0 && <b>{openTasks.length}</b>}
            {item.id === "leads" && activeLeads.length > 0 && <b>{activeLeads.length}</b>}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="avatar" style={{ background: String(currentUser?.color || "#ff5a1f") }}>{String(currentUser?.initials || "AA")}</div>
        <div className="user-switch">
          <select
            value={currentUserId}
            onChange={(e) => { setCurrentUserId(e.target.value); localStorage.setItem("acceleriamo-user", e.target.value); }}
            aria-label="Utente attivo"
          >
            {data.members.filter((m) => m.active !== false && m.active !== 0).map((m) => (
              <option key={String(m.id)} value={String(m.id)}>{m.name}</option>
            ))}
          </select>
          <small>{ROLE_LABELS[String(currentUser?.role || "admin") as Role] || currentUser?.role || "Team"}</small>
        </div>
      </div>
    </aside>

    <main className="workspace">
      <header className="topbar">
        <div>
          <span className="eyebrow"><i />ACCELERIAMO OS</span>
          <h1>{nav.find((item) => item.id === section)?.label}</h1>
        </div>
        <div className="top-actions">
          <label className="search">
            ⌕
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca lead, clienti, task…" />
            {query && <button type="button" onClick={() => setQuery("")}>✕</button>}
          </label>
          <Button className="primary-button" onClick={openNew}>＋ Nuovo</Button>
        </div>
      </header>

      {!loaded ? <div className="loading-grid"><div /><div /><div /></div> : <>
        {section === "dashboard" && (
          <Dashboard
            data={data} activeLeads={activeLeads} openTasks={openTasks} dueTotal={dueTotal} receivedTotal={receivedTotal}
            stageMap={stageMap} setSection={setSection} setModal={setModal}
            openLead={(id) => { setSelectedLeadId(id); setSection("leads"); }}
            userName={String(currentUser?.name || "Team")}
          />
        )}
        {section === "leads" && can(perms, "leads") && (
          <Leads
            data={data} leads={filteredLeads} act={act} setModal={setModal} stageMap={stageMap}
            selectedLead={selectedLead} setSelectedLeadId={setSelectedLeadId}
            canWrite={can(perms, "leads", "write")}
            openDocument={openDocument}
            onEdit={(lead) => { setEditing(lead); setModal("editLead"); }}
            onConvert={(lead) => { setEditing(lead); setModal("convert"); }}
            onCall={(lead) => { setEditing(lead); setModal("call"); }}
            onMeeting={(lead) => { setEditing(lead); setModal("meeting"); }}
            onProposal={(lead) => { setEditing(lead); setModal("proposal"); }}
          />
        )}
        {section === "clients" && can(perms, "clients") && (
          <Clients
            data={data} clients={filteredClients}
            selectedClient={selectedClient} setSelectedClientId={setSelectedClientId}
            canWrite={can(perms, "clients", "write")}
            canDocs={can(perms, "documents", "write")}
            openDocument={openDocument}
            onEdit={(client) => { setEditing(client); setModal("editClient"); }}
            onNote={(client) => { setEditing(client); setModal("note"); }}
            act={act}
            setModal={setModal}
          />
        )}
        {section === "tasks" && can(perms, "tasks") && (
          <Tasks data={data} tasks={filteredTasks} act={act} setModal={setModal} canWrite={can(perms, "tasks", "write")} />
        )}
        {section === "finance" && can(perms, "finance") && (
          <Finance data={data} act={act} setModal={setModal} dueTotal={dueTotal} receivedTotal={receivedTotal} canWrite={can(perms, "finance", "write")} />
        )}
        {section === "jobs" && can(perms, "jobs") && (
          <Jobs
            data={data} jobs={filteredJobs} setModal={setModal} act={act}
            canWrite={can(perms, "jobs", "write")}
            onEdit={(job) => { setEditing(job); setModal("editJob"); }}
          />
        )}
        {section === "team" && can(perms, "team") && (
          <Team
            data={data} setModal={setModal} act={act}
            onEdit={(member) => { setEditing(member); setModal("editMember"); }}
          />
        )}
      </>}
    </main>

    <Dialog open={modal !== null} onOpenChange={(open) => { if (!open) { setModal(null); setEditing(null); } }}>
      <DialogContent className="modal-card">
        <DialogHeader>
          <DialogTitle>{modalTitle(modal)}</DialogTitle>
          <DialogDescription>{modalCopy(modal)}</DialogDescription>
        </DialogHeader>

        {modal === "lead" && (
          <form onSubmit={(e) => submit(e, "createLead", "Lead creato")} className="form-grid">
            <Field label="Azienda *" name="company" autoFocus />
            <Field label="Contatto" name="contactName" />
            <Field label="Email" name="email" type="email" />
            <Field label="Telefono" name="phone" />
            <Field label="Valore stimato" name="estimatedValue" type="number" />
            <FormSelect label="Fonte" name="source" rows={LEAD_SOURCES.map((s) => ({ id: s, label: s }))} defaultValue="Meta Ads" />
            <FormSelect label="Fase iniziale" name="statusId" rows={data.stages} defaultValue="da-chiamare-prima-volta" />
            <FormSelect label="Owner" name="ownerId" rows={data.members.filter((m) => m.active !== 0 && m.active !== false)} defaultValue={currentUserId} />
            <Field label="Note" name="notes" wide />
            <Submit pending={pending} label="Crea lead" />
          </form>
        )}

        {modal === "editLead" && editing && (
          <form onSubmit={(e) => submit(e, "updateLead", "Lead aggiornato", { id: editing.id })} className="form-grid">
            <Field label="Azienda *" name="company" defaultValue={String(editing.company || "")} autoFocus />
            <Field label="Contatto" name="contactName" defaultValue={String(editing.contactName || "")} />
            <Field label="Email" name="email" type="email" defaultValue={String(editing.email || "")} />
            <Field label="Telefono" name="phone" defaultValue={String(editing.phone || "")} />
            <Field label="Valore stimato" name="estimatedValue" type="number" defaultValue={String(editing.estimatedValue || 0)} />
            <FormSelect label="Fonte" name="source" rows={LEAD_SOURCES.map((s) => ({ id: s, label: s }))} defaultValue={String(editing.source || "Manuale")} />
            <FormSelect label="Fase" name="statusId" rows={data.stages} defaultValue={String(editing.statusId)} />
            <FormSelect label="Owner" name="ownerId" rows={data.members} defaultValue={String(editing.ownerId || currentUserId)} />
            <Field label="Link meeting" name="meetingLink" defaultValue={String(editing.meetingLink || "")} />
            <Field label="Link proposta" name="proposalUrl" defaultValue={String(editing.proposalUrl || "")} />
            <Field label="Appuntamento" name="appointmentAt" type="datetime-local" defaultValue={toLocalInput(editing.appointmentAt)} />
            <Area label="Note commerciali" name="notes" defaultValue={String(editing.notes || "")} />
            <Area label="Log chiamate" name="callNotes" defaultValue={String(editing.callNotes || "")} />
            <Submit pending={pending} label="Salva modifiche" />
          </form>
        )}

        {modal === "call" && editing && (
          <form onSubmit={(e) => submit(e, "logCall", "Chiamata registrata", { id: editing.id })} className="form-grid">
            <FormSelect label="Esito *" name="outcome" rows={[
              { id: "Risposto — interessato", label: "Risposto — interessato" },
              { id: "Risposto — da richiamare", label: "Risposto — da richiamare" },
              { id: "Non risponde", label: "Non risponde" },
              { id: "Numero errato", label: "Numero errato" },
              { id: "Fuori target", label: "Fuori target" },
            ]} defaultValue="Risposto — interessato" />
            <FormSelect label="Aggiorna fase" name="statusId" rows={[{ id: "_none", label: "Non cambiare" }, ...data.stages]} defaultValue="da-richiamare" />
            <Area label="Note chiamata" name="notes" />
            <Submit pending={pending} label="Salva chiamata" />
          </form>
        )}

        {modal === "meeting" && editing && (
          <form onSubmit={(e) => submit(e, "scheduleMeeting", "Videocall fissata", { id: editing.id })} className="form-grid">
            <Field label="Data e ora *" name="appointmentAt" type="datetime-local" autoFocus wide />
            <Field label="Link Meet / Zoom" name="meetingLink" wide placeholder="https://meet.google.com/..." />
            <FormSelect label="Fase" name="statusId" rows={data.stages} defaultValue="appuntamento-confermato" />
            <Submit pending={pending} label="Fissa videocall" />
          </form>
        )}

        {modal === "proposal" && editing && (
          <form onSubmit={(e) => submit(e, "setProposal", "Proposta salvata", { id: editing.id })} className="form-grid">
            <Field label="Nome" name="name" defaultValue="Proposta Figma" />
            <Field label="Link Figma *" name="proposalUrl" autoFocus placeholder="https://www.figma.com/..." />
            <FormSelect label="Fase" name="statusId" rows={data.stages} defaultValue="in-attesa-decisione" />
            <Submit pending={pending} label="Salva proposta" />
          </form>
        )}

        {modal === "convert" && editing && (
          <form onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget).entries());
            void act({ action: "convertLead", id: editing.id, createJob: values.createJob === "1", ...values }, "Lead trasformato in cliente");
            setSelectedLeadId(null);
          }} className="form-grid">
            <p className="form-hint field--wide">Converti <strong>{editing.company}</strong> in cliente. Opzionalmente crea subito il lavoro con i task automatici (onboarding → collaudo + fattura ricorrente).</p>
            <label className="field check-field field--wide">
              <input type="checkbox" name="createJob" value="1" defaultChecked />
              <span>Crea anche un lavoro con task automatici</span>
            </label>
            <FormSelect label="Modello lavoro" name="templateId" rows={data.templates.filter((t) => t.active !== 0 && t.active !== false).map((r) => ({ ...r, label: r.title }))} />
            <Field label="Titolo personalizzato" name="title" placeholder={String(editing.company)} />
            <Field label="Prezzo concordato" name="price" type="number" />
            <FormSelect label="Responsabile" name="ownerId" rows={data.members} defaultValue={String(editing.ownerId || currentUserId)} />
            <Field label="Inizio" name="startDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            <Field label="Consegna" name="dueDate" type="date" />
            <Submit pending={pending} label="Trasforma in cliente" />
          </form>
        )}

        {modal === "editClient" && editing && (
          <form onSubmit={(e) => submit(e, "updateClient", "Cliente aggiornato", { id: editing.id })} className="form-grid">
            <Field label="Azienda *" name="company" defaultValue={String(editing.company || "")} autoFocus />
            <Field label="Contatto" name="contactName" defaultValue={String(editing.contactName || "")} />
            <Field label="Email" name="email" type="email" defaultValue={String(editing.email || "")} />
            <Field label="Telefono" name="phone" defaultValue={String(editing.phone || "")} />
            <FormSelect label="Owner" name="ownerId" rows={data.members} defaultValue={String(editing.ownerId || currentUserId)} />
            <FormSelect label="Stato" name="status" rows={[{ id: "attivo", label: "Attivo" }, { id: "pausa", label: "In pausa" }, { id: "chiuso", label: "Chiuso" }]} defaultValue={String(editing.status || "attivo")} />
            <Area label="Note" name="notes" defaultValue={String(editing.notes || "")} />
            <Submit pending={pending} label="Salva cliente" />
          </form>
        )}

        {modal === "note" && editing && (
          <form onSubmit={(e) => submit(e, "addNote", "Nota salvata", { entityType: "client", entityId: editing.id, title: "Nota interna" })} className="form-grid">
            <Area label="Nota *" name="body" />
            <Submit pending={pending} label="Aggiungi nota" />
          </form>
        )}

        {modal === "task" && (
          <form onSubmit={(e) => submit(e, "createTask", "Task assegnato")} className="form-grid">
            <Field label="Task *" name="title" autoFocus wide />
            <FormSelect label="Assegnatario" name="assigneeId" rows={data.members.filter((m) => m.active !== 0 && m.active !== false)} defaultValue={currentUserId} />
            <Field label="Scadenza" name="dueDate" type="date" />
            <FormSelect label="Priorità" name="priority" rows={[{ id: "bassa", label: "Bassa" }, { id: "media", label: "Media" }, { id: "alta", label: "Alta" }]} defaultValue="media" />
            <FormSelect label="Tipo" name="kind" rows={[{ id: "oneoff", label: "Una tantum" }, { id: "recurring", label: "Ricorrente" }]} defaultValue="oneoff" />
            <FormSelect label="Ricorrenza" name="recurrence" rows={[{ id: "mensile", label: "Mensile" }, { id: "trimestrale", label: "Trimestrale" }, { id: "annuale", label: "Annuale" }]} />
            <FormSelect label="Cliente" name="clientId" rows={[{ id: "_none", label: "Nessuno" }, ...data.clients.map((r) => ({ ...r, label: r.company }))]} defaultValue="_none" />
            <FormSelect label="Lavoro" name="jobId" rows={[{ id: "_none", label: "Nessuno" }, ...data.jobs.map((r) => ({ ...r, label: `${r.clientName} — ${r.title}` }))]} defaultValue="_none" />
            <FormSelect label="Lead" name="leadId" rows={[{ id: "_none", label: "Nessuno" }, ...data.leads.map((r) => ({ ...r, label: r.company }))]} defaultValue="_none" />
            <Area label="Descrizione" name="description" />
            <Submit pending={pending} label="Assegna task" />
          </form>
        )}

        {modal === "payment" && (
          <form onSubmit={(e) => submit(e, "createPayment", "Pagamento registrato")} className="form-grid">
            <FormSelect label="Cliente *" name="clientId" rows={data.clients.map((row) => ({ ...row, label: row.company }))} defaultValue={selectedClientId || undefined} />
            <Field label="Descrizione *" name="description" />
            <Field label="Importo" name="amount" type="number" />
            <FormSelect label="Tipo" name="kind" rows={[{ id: "oneoff", label: "Una tantum" }, { id: "recurring", label: "Ricorrente" }]} defaultValue="oneoff" />
            <Field label="Scadenza" name="dueDate" type="date" />
            <Field label="Prossima emissione" name="nextIssueAt" type="date" />
            <FormSelect label="Ricorrenza" name="recurrence" rows={[{ id: "mensile", label: "Mensile" }, { id: "trimestrale", label: "Trimestrale" }, { id: "annuale", label: "Annuale" }]} />
            <Submit pending={pending} label="Salva movimento" />
          </form>
        )}

        {modal === "template" && (
          <form onSubmit={(e) => submit(e, "createTemplate", "Lavoro standard creato")} className="form-grid">
            <Field label="Nome lavoro *" name="title" autoFocus />
            <Field label="Prezzo base" name="defaultPrice" type="number" />
            <Field label="Durata in giorni" name="defaultDays" type="number" defaultValue="30" />
            <Area label="Descrizione" name="description" />
            <p className="form-hint field--wide">I task automatici di default (onboarding → collaudo + fattura) verranno applicati a ogni nuovo lavoro da questo modello.</p>
            <Submit pending={pending} label="Crea modello" />
          </form>
        )}

        {modal === "job" && (
          <form onSubmit={(e) => submit(e, "createJob", "Lavoro creato con task automatici")} className="form-grid">
            <FormSelect label="Cliente *" name="clientId" rows={data.clients.map((row) => ({ ...row, label: row.company }))} defaultValue={selectedClientId || undefined} />
            <FormSelect label="Lavoro standard" name="templateId" rows={data.templates.filter((t) => t.active !== 0 && t.active !== false).map((row) => ({ ...row, label: row.title }))} />
            <Field label="Titolo personalizzato" name="title" />
            <Field label="Prezzo concordato" name="price" type="number" />
            <FormSelect label="Responsabile" name="ownerId" rows={data.members} defaultValue={currentUserId} />
            <FormSelect label="Stato" name="status" rows={JOB_STATUSES.map((s) => ({ id: s.id, label: s.label }))} defaultValue="pianificato" />
            <Field label="Inizio" name="startDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            <Field label="Consegna" name="dueDate" type="date" />
            <Area label="Note" name="notes" />
            <Submit pending={pending} label="Crea lavoro + task" />
          </form>
        )}

        {modal === "editJob" && editing && (
          <form onSubmit={(e) => submit(e, "updateJob", "Lavoro aggiornato", { id: editing.id })} className="form-grid">
            <FormSelect label="Cliente *" name="clientId" rows={data.clients.map((row) => ({ ...row, label: row.company }))} defaultValue={String(editing.clientId)} />
            <Field label="Titolo *" name="title" defaultValue={String(editing.title || "")} autoFocus />
            <Field label="Prezzo" name="price" type="number" defaultValue={String(editing.price || 0)} />
            <FormSelect label="Responsabile" name="ownerId" rows={data.members} defaultValue={String(editing.ownerId)} />
            <FormSelect label="Stato" name="status" rows={JOB_STATUSES.map((s) => ({ id: s.id, label: s.label }))} defaultValue={String(editing.status)} />
            <Field label="Inizio" name="startDate" type="date" defaultValue={String(editing.startDate || "")} />
            <Field label="Consegna" name="dueDate" type="date" defaultValue={String(editing.dueDate || "")} />
            <Area label="Note" name="notes" defaultValue={String(editing.notes || "")} />
            <Submit pending={pending} label="Salva lavoro" />
          </form>
        )}

        {modal === "member" && (
          <form onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget).entries());
            const role = String(values.role || "commerciale");
            void act({ action: "createMember", ...values, permissions: JSON.stringify(ROLE_PRESETS[role as Role] || ROLE_PRESETS.commerciale) }, "Membro aggiunto");
          }} className="form-grid">
            <Field label="Nome *" name="name" autoFocus />
            <Field label="Iniziali" name="initials" />
            <Field label="Email" name="email" type="email" />
            <Field label="Colore" name="color" type="color" defaultValue="#397ba8" />
            <FormSelect label="Ruolo" name="role" rows={Object.entries(ROLE_LABELS).map(([id, label]) => ({ id, label }))} defaultValue="commerciale" />
            <Submit pending={pending} label="Aggiungi al team" />
          </form>
        )}

        {modal === "editMember" && editing && (
          <form onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget).entries());
            const role = String(values.role || editing.role || "commerciale");
            void act({
              action: "updateMember",
              id: editing.id,
              ...values,
              active: values.active === "1",
              permissions: JSON.stringify(ROLE_PRESETS[role as Role] || ROLE_PRESETS.commerciale),
            }, "Membro aggiornato");
          }} className="form-grid">
            <Field label="Nome *" name="name" defaultValue={String(editing.name || "")} autoFocus />
            <Field label="Iniziali" name="initials" defaultValue={String(editing.initials || "")} />
            <Field label="Email" name="email" type="email" defaultValue={String(editing.email || "")} />
            <Field label="Colore" name="color" type="color" defaultValue={String(editing.color || "#397ba8")} />
            <FormSelect label="Ruolo" name="role" rows={Object.entries(ROLE_LABELS).map(([id, label]) => ({ id, label }))} defaultValue={String(editing.role || "commerciale")} />
            <FormSelect label="Attivo" name="active" rows={[{ id: "1", label: "Attivo" }, { id: "0", label: "Disattivato" }]} defaultValue={editing.active === 0 || editing.active === false ? "0" : "1"} />
            <p className="form-hint field--wide">I permessi seguono il ruolo: Admin tutto; Commerciale pipeline/clienti/lavori; Sviluppatore lavori/task; Finance pagamenti.</p>
            <Submit pending={pending} label="Salva membro" />
          </form>
        )}

        {modal === "document" && (
          <DocumentForm
            data={data}
            pending={pending}
            setPending={setPending}
            setData={setData}
            close={() => setModal(null)}
            defaults={docDefaults}
            actorId={currentUserId}
          />
        )}
      </DialogContent>
    </Dialog>
    <Toaster richColors position="bottom-right" />
  </div>;
}

function Dashboard({ data, activeLeads, openTasks, dueTotal, receivedTotal, stageMap, setSection, setModal, openLead, userName }: {
  data: DashboardData; activeLeads: Row[]; openTasks: Row[]; dueTotal: number; receivedTotal: number;
  stageMap: Map<unknown, Row>; setSection: (s: Section) => void; setModal: (m: Modal) => void;
  openLead: (id: string) => void; userName: string;
}) {
  const todayMeetings = data.leads.filter((l) => l.appointmentAt && String(l.appointmentAt).slice(0, 10) === new Date().toISOString().slice(0, 10));
  const metaLeads = data.leads.filter((l) => String(l.source).toLowerCase().includes("meta"));
  return <div className="page-stack">
    <section className="welcome">
      <div>
        <span>Buongiorno, {userName}</span>
        <h2>Dal lead Meta<br /><em>al collaudo.</em></h2>
      </div>
      <div className="quick-actions">
        <button onClick={() => setModal("lead")}>＋ Lead</button>
        <button onClick={() => setModal("task")}>＋ Task</button>
        <button onClick={() => setModal("job")}>＋ Lavoro</button>
      </div>
    </section>
    <section className="metric-grid">
      <Metric label="Lead aperti" value={activeLeads.length} note={`${metaLeads.length} da Meta Ads`} tone="orange" />
      <Metric label="Task da fare" value={openTasks.length} note={`${openTasks.filter((t) => t.priority === "alta").length} ad alta priorità`} tone="ink" />
      <Metric label="Da incassare" value={money.format(dueTotal)} note={`Incassati ${money.format(receivedTotal)}`} tone="cream" />
      <Metric label="Lavori attivi" value={data.jobs.filter((j) => j.status !== "completato").length} note={`${todayMeetings.length} call oggi`} tone="green" />
    </section>
    <section className="dashboard-grid">
      <div className="panel pipeline-panel">
        <PanelHead eyebrow="Pipeline" title="Dove sono i lead" action="Apri pipeline" onAction={() => setSection("leads")} />
        <div className="pipeline-bars">
          {data.stages.filter((stage) => Number(stage.sortOrder) <= 80).map((stage) => {
            const count = data.leads.filter((lead) => lead.statusId === stage.id).length;
            const width = Math.max(5, count / Math.max(1, data.leads.length) * 100);
            return <div key={String(stage.id)} className="pipeline-row"><span>{stage.label}</span><div><i className={`tone-${stage.tone}`} style={{ width: `${width}%` }} /></div><b>{count}</b></div>;
          })}
        </div>
      </div>
      <div className="panel">
        <PanelHead eyebrow="Oggi" title="Task in arrivo" action="Vedi tutti" onAction={() => setSection("tasks")} />
        {openTasks.length ? <div className="mini-list">{openTasks.slice(0, 5).map((task) => (
          <div key={String(task.id)}><span className={`check priority-${task.priority}`} /><div><strong>{task.title}</strong><small>{task.assigneeName || "Team"} · {date(task.dueDate)}{task.kind === "recurring" ? " · ricorrente" : ""}</small></div></div>
        ))}</div> : <Empty title="Tutto fatto" copy="Nessun task aperto in questo momento." />}
      </div>
    </section>
    <section className="panel">
      <PanelHead eyebrow="Opportunità" title="Lead recenti" action="Nuovo lead" onAction={() => setModal("lead")} />
      {data.leads.length ? <Table>
        <TableHeader><TableRow><TableHead>Azienda</TableHead><TableHead>Fonte</TableHead><TableHead>Fase</TableHead><TableHead>Prossimo step</TableHead><TableHead className="text-right">Valore</TableHead></TableRow></TableHeader>
        <TableBody>{data.leads.slice(0, 6).map((lead) => {
          const stage = stageMap.get(lead.statusId);
          return <TableRow key={String(lead.id)} className="click-row" onClick={() => openLead(String(lead.id))}>
            <TableCell><strong>{lead.company}</strong><div className="muted">{lead.contactName || "—"}</div></TableCell>
            <TableCell><Badge tone={String(lead.source).includes("Meta") ? "blue" : "neutral"}>{lead.source}</Badge></TableCell>
            <TableCell><Badge tone={String(stage?.tone)}>{stage?.label || lead.statusId}</Badge></TableCell>
            <TableCell className="muted">{lead.appointmentAt ? `Call ${datetime(lead.appointmentAt)}` : lead.proposalUrl ? "In attesa decisione" : "Da contattare"}</TableCell>
            <TableCell className="text-right">{money.format(Number(lead.estimatedValue || 0))}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table> : <Empty title="La pipeline è pronta" copy="Inserisci il primo lead Meta Ads per iniziare." />}
    </section>
  </div>;
}

function Leads({ data, leads, act, setModal, stageMap, selectedLead, setSelectedLeadId, canWrite, openDocument, onEdit, onConvert, onCall, onMeeting, onProposal }: {
  data: DashboardData; leads: Row[]; act: (p: Record<string, unknown>, s?: string) => Promise<unknown>; setModal: (m: Modal) => void;
  stageMap: Map<unknown, Row>; selectedLead: Row | null; setSelectedLeadId: (id: string | null) => void; canWrite: boolean;
  openDocument: (d: { leadId?: string; clientId?: string; kind?: string }) => void;
  onEdit: (l: Row) => void; onConvert: (l: Row) => void; onCall: (l: Row) => void; onMeeting: (l: Row) => void; onProposal: (l: Row) => void;
}) {
  const docs = selectedLead ? data.documents.filter((d) => d.leadId === selectedLead.id) : [];
  const acts = selectedLead ? data.activities.filter((a) => a.entityType === "lead" && a.entityId === selectedLead.id) : [];
  const tasks = selectedLead ? data.tasks.filter((t) => t.leadId === selectedLead.id) : [];

  return <div className={`page-stack ${selectedLead ? "with-detail" : ""}`}>
    <div className="section-intro">
      <p>Flusso commerciale: chiamata → videocall → riassunto → proposta → chiusura.</p>
      {canWrite && <Button className="primary-button" onClick={() => setModal("lead")}>＋ Aggiungi lead</Button>}
    </div>
    <div className={selectedLead ? "split-view" : ""}>
      <div className="panel table-panel">
        {leads.length ? <Table>
          <TableHeader><TableRow><TableHead>Azienda</TableHead><TableHead>Fonte</TableHead><TableHead>Valore</TableHead><TableHead>Fase</TableHead><TableHead>Azioni</TableHead></TableRow></TableHeader>
          <TableBody>{leads.map((lead) => (
            <TableRow key={String(lead.id)} className={selectedLead?.id === lead.id ? "is-selected" : "click-row"} onClick={() => setSelectedLeadId(String(lead.id))}>
              <TableCell><div className="entity"><i>{String(lead.company).slice(0, 2).toUpperCase()}</i><div><strong>{lead.company}</strong><small>{lead.phone || lead.email || "Nessun contatto"}</small></div></div></TableCell>
              <TableCell><Badge tone={String(lead.source).includes("Meta") ? "blue" : "neutral"}>{lead.source}</Badge></TableCell>
              <TableCell>{money.format(Number(lead.estimatedValue || 0))}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Select value={String(lead.statusId)} onValueChange={(statusId) => canWrite && act({ action: "updateLeadStage", id: lead.id, statusId }, "Fase aggiornata")}>
                  <SelectTrigger className="stage-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{data.stages.map((stage) => <SelectItem key={String(stage.id)} value={String(stage.id)}>{stage.label}</SelectItem>)}</SelectContent>
                </Select>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <div className="row-actions">
                  {canWrite && <button onClick={() => onCall(lead)}>Chiama</button>}
                  {canWrite && lead.statusId !== "chiuso" && <button className="strong" onClick={() => onConvert(lead)}>Cliente</button>}
                </div>
              </TableCell>
            </TableRow>
          ))}</TableBody>
        </Table> : <Empty title="Nessun lead" copy="Aggiungi il primo contatto da Meta Ads." />}
      </div>

      {selectedLead && (
        <aside className="detail-panel">
          <div className="detail-head">
            <button className="ghost" onClick={() => setSelectedLeadId(null)}>← Chiudi</button>
            <Badge tone={String(stageMap.get(selectedLead.statusId)?.tone)}>{stageMap.get(selectedLead.statusId)?.label || selectedLead.statusId}</Badge>
          </div>
          <h2>{selectedLead.company}</h2>
          <p className="detail-sub">{selectedLead.contactName || "Contatto"} · {selectedLead.source}</p>
          <div className="detail-contacts">
            {selectedLead.phone && <a href={`tel:${selectedLead.phone}`}>{selectedLead.phone}</a>}
            {selectedLead.email && <a href={`mailto:${selectedLead.email}`}>{selectedLead.email}</a>}
            <span>{money.format(Number(selectedLead.estimatedValue || 0))}</span>
          </div>

          {canWrite && (
            <div className="detail-actions">
              <button onClick={() => onCall(selectedLead)}>① Chiama</button>
              <button onClick={() => onMeeting(selectedLead)}>② Fissa call</button>
              <button onClick={() => openDocument({ leadId: String(selectedLead.id), kind: "riassunto" })}>③ Riassunto</button>
              <button onClick={() => onProposal(selectedLead)}>④ Proposta</button>
              {selectedLead.statusId !== "chiuso" && <button className="strong" onClick={() => onConvert(selectedLead)}>⑤ → Cliente</button>}
              <button onClick={() => onEdit(selectedLead)}>Modifica</button>
            </div>
          )}

          <section className="detail-block">
            <h3>Appuntamento</h3>
            <p>{selectedLead.appointmentAt ? datetime(selectedLead.appointmentAt) : "Nessuna videocall fissata"}</p>
            {selectedLead.meetingLink ? <a href={String(selectedLead.meetingLink)} target="_blank" rel="noreferrer">Apri link meeting</a> : null}
            {selectedLead.proposalUrl ? <a href={String(selectedLead.proposalUrl)} target="_blank" rel="noreferrer">Apri proposta Figma</a> : null}
          </section>

          <section className="detail-block">
            <div className="detail-block__head"><h3>Documenti</h3>{canWrite && <button onClick={() => openDocument({ leadId: String(selectedLead.id) })}>＋</button>}</div>
            {docs.length ? docs.map((doc) => (
              <a key={String(doc.id)} className="doc-row" href={doc.externalUrl ? String(doc.externalUrl) : `/api/documents/${doc.id}`} target="_blank" rel="noreferrer">
                <strong>{doc.name}</strong><small>{kindLabel(doc.kind)} · {date(doc.uploadedAt)}</small>
              </a>
            )) : <p className="muted">Nessun documento ancora.</p>}
          </section>

          <section className="detail-block">
            <h3>Task collegati</h3>
            {tasks.length ? tasks.map((t) => <div key={String(t.id)} className="mini-item"><strong>{t.title}</strong><small>{t.status} · {date(t.dueDate)}</small></div>) : <p className="muted">Nessun task.</p>}
          </section>

          <section className="detail-block">
            <h3>Log chiamate</h3>
            <pre className="notes-box">{selectedLead.callNotes || "Nessuna chiamata registrata."}</pre>
          </section>

          <section className="detail-block">
            <h3>Timeline</h3>
            {acts.length ? <div className="timeline">{acts.map((a) => (
              <div key={String(a.id)}><b>{a.title}</b><small>{datetime(a.createdAt)} · {a.actorName || "Sistema"}</small>{a.body ? <p>{a.body}</p> : null}</div>
            ))}</div> : <p className="muted">Nessuna attività.</p>}
          </section>

          {canWrite && (
            <button className="danger-link" onClick={() => {
              if (confirm("Eliminare questo lead?")) void act({ action: "deleteLead", id: selectedLead.id }, "Lead eliminato").then(() => setSelectedLeadId(null));
            }}>Elimina lead</button>
          )}
        </aside>
      )}
    </div>
  </div>;
}

function Clients({ data, clients, selectedClient, setSelectedClientId, canWrite, canDocs, openDocument, onEdit, onNote, act, setModal }: {
  data: DashboardData; clients: Row[]; selectedClient: Row | null; setSelectedClientId: (id: string | null) => void;
  canWrite: boolean; canDocs: boolean; openDocument: (d: { leadId?: string; clientId?: string; kind?: string }) => void;
  onEdit: (c: Row) => void; onNote: (c: Row) => void; act: (p: Record<string, unknown>, s?: string) => Promise<unknown>; setModal: (m: Modal) => void;
}) {
  const docs = selectedClient ? data.documents.filter((d) => d.clientId === selectedClient.id) : [];
  const jobs = selectedClient ? data.jobs.filter((j) => j.clientId === selectedClient.id) : [];
  const tasks = selectedClient ? data.tasks.filter((t) => t.clientId === selectedClient.id) : [];
  const payments = selectedClient ? data.payments.filter((p) => p.clientId === selectedClient.id) : [];
  const acts = selectedClient ? data.activities.filter((a) => a.entityType === "client" && a.entityId === selectedClient.id) : [];
  const originLead = selectedClient?.leadId ? data.leads.find((l) => l.id === selectedClient.leadId) : null;

  if (selectedClient) {
    return <div className="page-stack">
      <div className="detail-page">
        <div className="detail-head">
          <button className="ghost" onClick={() => setSelectedClientId(null)}>← Tutti i clienti</button>
          <Badge tone={selectedClient.status === "attivo" ? "green" : selectedClient.status === "pausa" ? "yellow" : "neutral"}>{String(selectedClient.status || "attivo")}</Badge>
        </div>
        <header className="client-hero">
          <div>
            <h2>{selectedClient.company}</h2>
            <p>{selectedClient.contactName || "Contatto"} · dal {date(selectedClient.createdAt)}{originLead ? ` · da lead ${originLead.company}` : ""}</p>
            <div className="detail-contacts">
              {selectedClient.phone && <a href={`tel:${selectedClient.phone}`}>{selectedClient.phone}</a>}
              {selectedClient.email && <a href={`mailto:${selectedClient.email}`}>{selectedClient.email}</a>}
            </div>
          </div>
          <div className="detail-actions">
            {canWrite && <button onClick={() => onEdit(selectedClient)}>Modifica</button>}
            {canDocs && <button onClick={() => openDocument({ clientId: String(selectedClient.id) })}>＋ Documento</button>}
            {canWrite && <button onClick={() => setModal("job")}>＋ Lavoro</button>}
            {canWrite && <button onClick={() => setModal("payment")}>＋ Pagamento</button>}
            {canWrite && <button onClick={() => onNote(selectedClient)}>＋ Nota</button>}
          </div>
        </header>

        <div className="metric-grid client-metrics">
          <Metric label="Lavori" value={jobs.length} note={`${jobs.filter((j) => j.status !== "completato").length} attivi`} tone="ink" />
          <Metric label="Task aperti" value={tasks.filter((t) => t.status !== "done").length} note={`${tasks.length} totali`} tone="orange" />
          <Metric label="Documenti" value={docs.length} note={`${docs.filter((d) => d.kind === "proposta").length} proposte`} tone="cream" />
          <Metric label="Da incassare" value={money.format(payments.filter((p) => p.status === "due").reduce((s, p) => s + Number(p.amount || 0), 0))} note={`${payments.length} movimenti`} tone="green" />
        </div>

        <div className="client-columns">
          <section className="panel">
            <PanelHead eyebrow="Produzione" title="Lavori" action="＋" onAction={() => setModal("job")} />
            {jobs.length ? <div className="mini-list">{jobs.map((job) => (
              <div key={String(job.id)}><span className={`check tone-dot tone-${jobTone(job.status)}`} /><div><strong>{job.title}</strong><small>{jobLabel(job.status)} · {job.ownerName} · {money.format(Number(job.price || 0))}</small></div></div>
            ))}</div> : <Empty title="Nessun lavoro" copy="Assegna un lavoro con task automatici." />}
          </section>
          <section className="panel">
            <PanelHead eyebrow="Operativi" title="Task" action="Vedi" onAction={() => undefined} />
            {tasks.length ? <div className="mini-list">{tasks.slice(0, 12).map((task) => (
              <div key={String(task.id)}><span className={`check priority-${task.priority}`} /><div><strong>{task.title}</strong><small>{task.status === "done" ? "Fatto" : "Da fare"} · {date(task.dueDate)}{task.kind === "recurring" ? " · ricorrente" : ""}</small></div></div>
            ))}</div> : <Empty title="Nessun task" copy="I task nascono con il lavoro." />}
          </section>
        </div>

        <div className="client-columns">
          <section className="panel">
            <PanelHead eyebrow="Archivio" title="Documenti" action="＋" onAction={() => openDocument({ clientId: String(selectedClient.id) })} />
            {docs.length ? <div className="doc-list">{docs.map((doc) => (
              <a key={String(doc.id)} className="doc-row" href={doc.externalUrl ? String(doc.externalUrl) : `/api/documents/${doc.id}`} target="_blank" rel="noreferrer">
                <div><strong>{doc.name}</strong><small>{kindLabel(doc.kind)} · {date(doc.uploadedAt)}{Number(doc.size) > 0 ? ` · ${Math.round(Number(doc.size) / 1024)} KB` : ""}</small></div>
                <Badge tone={doc.kind === "proposta" ? "violet" : doc.kind === "riassunto" ? "blue" : "neutral"}>{kindLabel(doc.kind)}</Badge>
              </a>
            ))}</div> : <Empty title="Archivio vuoto" copy="Carica riassunti, proposte Figma, contratti." />}
          </section>
          <section className="panel">
            <PanelHead eyebrow="Finance" title="Pagamenti" action="＋" onAction={() => setModal("payment")} />
            {payments.length ? <div className="mini-list">{payments.map((p) => (
              <div key={String(p.id)}><div><strong>{p.description}</strong><small>{money.format(Number(p.amount))} · {p.status === "received" ? "Ricevuto" : "Da incassare"}{p.kind === "recurring" ? ` · ${p.recurrence}` : ""}</small></div>
                {p.status !== "received" && <button className="mark-paid" onClick={() => act({ action: "markPaymentReceived", id: p.id }, "Incassato")}>Incassa</button>}
              </div>
            ))}</div> : <Empty title="Nessun pagamento" copy="Registra acconti e fatture ricorrenti." />}
          </section>
        </div>

        <section className="panel">
          <PanelHead eyebrow="Storia" title="Timeline completa" action="Nota" onAction={() => onNote(selectedClient)} />
          {selectedClient.notes ? <pre className="notes-box" style={{ margin: "16px 24px 0" }}>{String(selectedClient.notes)}</pre> : null}
          {acts.length ? <div className="timeline padded">{acts.map((a) => (
            <div key={String(a.id)}><b>{a.title}</b><small>{datetime(a.createdAt)} · {a.actorName || "Sistema"}</small>{a.body ? <p>{a.body}</p> : null}</div>
          ))}</div> : <Empty title="Nessuna attività" copy="Le azioni sul cliente appariranno qui." />}
        </section>
      </div>
    </div>;
  }

  return <div className="page-stack">
    <div className="section-intro">
      <p>Scheda cliente 360°: documenti, lavori, task, pagamenti e timeline.</p>
      {canDocs && <Button variant="outline" onClick={() => openDocument({})}>＋ Carica documento</Button>}
    </div>
    {clients.length ? <div className="client-grid">{clients.map((client) => {
      const cDocs = data.documents.filter((d) => d.clientId === client.id);
      const cJobs = data.jobs.filter((j) => j.clientId === client.id);
      return <article className="client-card clickable" key={String(client.id)} onClick={() => setSelectedClientId(String(client.id))}>
        <div className="client-card__top"><i>{String(client.company).slice(0, 2).toUpperCase()}</i><Badge tone={cJobs.length ? "green" : "neutral"}>{cJobs.length ? `${cJobs.length} lavori` : "Nuovo"}</Badge></div>
        <h3>{client.company}</h3>
        <p>{client.contactName || "Contatto non indicato"}</p>
        <span className="muted">{client.email || "Nessuna email"}</span>
        <div className="client-card__meta">
          <span>{cDocs.length}<small>Documenti</small></span>
          <span>{cJobs.length}<small>Lavori</small></span>
          <span>{data.tasks.filter((t) => t.clientId === client.id && t.status !== "done").length}<small>Task aperti</small></span>
        </div>
      </article>;
    })}</div> : <Empty title="Nessun cliente" copy="Trasforma un lead chiuso per trovarlo qui." />}
  </div>;
}

function Tasks({ data, tasks, act, setModal, canWrite }: {
  data: DashboardData; tasks: Row[]; act: (p: Record<string, unknown>, s?: string) => Promise<unknown>; setModal: (m: Modal) => void; canWrite: boolean;
}) {
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  return <div className="page-stack">
    <div className="section-intro">
      <p>Task di progetto, onboarding e ricorrenti (fatture, follow-up).</p>
      {canWrite && <Button className="primary-button" onClick={() => setModal("task")}>＋ Nuovo task</Button>}
    </div>
    {tasks.length ? <div className="task-board">
      <section>
        <h3>Da fare <b>{open.length}</b></h3>
        {open.map((task) => (
          <div className="task-card" key={String(task.id)}>
            <button className={`check priority-${task.priority}`} onClick={() => canWrite && act({ action: "toggleTask", id: task.id }, task.kind === "recurring" ? "Completato · prossima ricorrenza creata" : "Task completato")} aria-label="Completa" />
            <div>
              <strong>{task.title}</strong>
              <p>{task.description || "Nessuna nota"}</p>
              <small>
                {task.assigneeName} · {date(task.dueDate)}
                {task.clientName ? ` · ${task.clientName}` : ""}
                {task.jobTitle ? ` · ${task.jobTitle}` : ""}
                {task.kind === "recurring" ? ` · ${task.recurrence}` : ""}
              </small>
            </div>
            {canWrite && <button className="ghost-mini" onClick={() => act({ action: "deleteTask", id: task.id }, "Task eliminato")}>✕</button>}
          </div>
        ))}
      </section>
      <section>
        <h3>Completati <b>{done.length}</b></h3>
        {done.map((task) => (
          <button className="task-card is-done" key={String(task.id)} onClick={() => canWrite && act({ action: "toggleTask", id: task.id }, "Task riaperto")}>
            <span className="check" /><div><strong>{task.title}</strong><small>{task.assigneeName}</small></div>
          </button>
        ))}
      </section>
    </div> : <Empty title="Agenda libera" copy="Crea un task o genera un lavoro: i task automatici arriveranno da soli." />}
  </div>;
}

function Finance({ data, act, setModal, dueTotal, receivedTotal, canWrite }: {
  data: DashboardData; act: (p: Record<string, unknown>, s?: string) => Promise<unknown>; setModal: (m: Modal) => void;
  dueTotal: number; receivedTotal: number; canWrite: boolean;
}) {
  return <div className="page-stack">
    <div className="metric-grid finance-metrics">
      <Metric label="Incassato" value={money.format(receivedTotal)} note="Pagamenti ricevuti" tone="green" />
      <Metric label="Da incassare" value={money.format(dueTotal)} note="Pagamenti aperti" tone="orange" />
      <Metric label="Ricorrenti" value={data.payments.filter((p) => p.kind === "recurring").length} note="Fatture programmate" tone="ink" />
    </div>
    <div className="section-intro">
      <p>Pagamenti ricevuti e fatture ricorrenti: segnando “ricevuto” si genera la prossima scadenza.</p>
      {canWrite && <Button className="primary-button" onClick={() => setModal("payment")}>＋ Registra</Button>}
    </div>
    <div className="panel table-panel">
      {data.payments.length ? <Table>
        <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Voce</TableHead><TableHead>Tipo</TableHead><TableHead>Scadenza</TableHead><TableHead>Importo</TableHead><TableHead>Stato</TableHead></TableRow></TableHeader>
        <TableBody>{data.payments.map((payment) => (
          <TableRow key={String(payment.id)}>
            <TableCell><strong>{payment.clientName}</strong></TableCell>
            <TableCell>{payment.description}</TableCell>
            <TableCell>{payment.kind === "recurring" ? <Badge tone="violet">{payment.recurrence || "Ricorrente"}</Badge> : "Una tantum"}</TableCell>
            <TableCell>{date(payment.dueDate || payment.nextIssueAt)}</TableCell>
            <TableCell>{money.format(Number(payment.amount))}</TableCell>
            <TableCell>
              {payment.status === "received"
                ? <Badge tone="green">Ricevuto</Badge>
                : canWrite ? <button className="mark-paid" onClick={() => act({ action: "markPaymentReceived", id: payment.id }, "Pagamento ricevuto")}>Segna ricevuto</button> : <Badge>Due</Badge>}
            </TableCell>
          </TableRow>
        ))}</TableBody>
      </Table> : <Empty title="Nessun movimento" copy="Registra un pagamento o una fattura ricorrente." />}
    </div>
  </div>;
}

function Jobs({ data, jobs, setModal, act, canWrite, onEdit }: {
  data: DashboardData; jobs: Row[]; setModal: (m: Modal) => void; act: (p: Record<string, unknown>, s?: string) => Promise<unknown>;
  canWrite: boolean; onEdit: (j: Row) => void;
}) {
  return <div className="page-stack">
    <div className="section-intro">
      <p>Modelli con checklist automatica: onboarding, allineamento, revisioni, consegna, fattura.</p>
      <div className="button-pair">
        {canWrite && <Button variant="outline" onClick={() => setModal("template")}>＋ Nuovo modello</Button>}
        {canWrite && <Button className="primary-button" onClick={() => setModal("job")}>＋ Crea lavoro</Button>}
      </div>
    </div>
    <div className="template-grid">{data.templates.filter((t) => t.active !== 0 && t.active !== false).map((template) => {
      let steps = 0;
      try { steps = JSON.parse(String(template.taskBlueprint || "[]")).length; } catch { steps = 0; }
      return <article className="template-card" key={String(template.id)}>
        <img src="/icons/jobs.png" alt="" />
        <span>MODELLO · {steps || 7} TASK</span>
        <h3>{template.title}</h3>
        <p>{template.description}</p>
        <div><b>{money.format(Number(template.defaultPrice))}</b><small>{template.defaultDays} giorni</small></div>
      </article>;
    })}</div>
    <div className="panel">
      <PanelHead eyebrow="Produzione" title="Lavori" action="Crea lavoro" onAction={() => setModal("job")} />
      {jobs.length ? <Table>
        <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Lavoro</TableHead><TableHead>Responsabile</TableHead><TableHead>Consegna</TableHead><TableHead>Prezzo</TableHead><TableHead>Stato</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>{jobs.map((job) => (
          <TableRow key={String(job.id)}>
            <TableCell><strong>{job.clientName}</strong></TableCell>
            <TableCell>{job.title}<div className="muted">{data.tasks.filter((t) => t.jobId === job.id && t.status !== "done").length} task aperti</div></TableCell>
            <TableCell>{job.ownerName}</TableCell>
            <TableCell>{date(job.dueDate)}</TableCell>
            <TableCell>{money.format(Number(job.price || 0))}</TableCell>
            <TableCell><Badge tone={jobTone(job.status)}>{jobLabel(job.status)}</Badge></TableCell>
            <TableCell>
              {canWrite && <div className="row-actions">
                <button onClick={() => onEdit(job)}>Modifica</button>
                <button onClick={() => { if (confirm("Eliminare lavoro e relativi task?")) void act({ action: "deleteJob", id: job.id }, "Lavoro eliminato"); }}>Elimina</button>
              </div>}
            </TableCell>
          </TableRow>
        ))}</TableBody>
      </Table> : <Empty title="Nessun lavoro" copy="Crea un lavoro da modello: i task si generano da soli." />}
    </div>
  </div>;
}

function Team({ data, setModal, act, onEdit }: {
  data: DashboardData; setModal: (m: Modal) => void; act: (p: Record<string, unknown>, s?: string) => Promise<unknown>; onEdit: (m: Row) => void;
}) {
  return <div className="page-stack">
    <div className="section-intro">
      <p>Membri, ruoli e permessi. Chi è loggato in sidebar vede solo ciò che può gestire.</p>
      <Button className="primary-button" onClick={() => setModal("member")}>＋ Aggiungi membro</Button>
    </div>
    <div className="client-grid">{data.members.map((member) => (
      <article className="client-card" key={String(member.id)}>
        <div className="client-card__top">
          <i style={{ background: String(member.color) }}>{String(member.initials)}</i>
          <Badge tone={member.active === 0 || member.active === false ? "red" : "green"}>
            {member.active === 0 || member.active === false ? "Disattivo" : "Attivo"}
          </Badge>
        </div>
        <h3>{member.name}</h3>
        <p>{ROLE_LABELS[String(member.role) as Role] || member.role}</p>
        <span className="muted">{member.email || "Nessuna email"}</span>
        <div className="client-card__meta">
          <span>{data.tasks.filter((t) => t.assigneeId === member.id && t.status !== "done").length}<small>Task aperti</small></span>
          <span>{data.jobs.filter((j) => j.ownerId === member.id && j.status !== "completato").length}<small>Lavori</small></span>
        </div>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button onClick={() => onEdit(member)}>Modifica</button>
          {member.id !== "diego" && (
            <button onClick={() => { if (confirm("Rimuovere o disattivare questo membro?")) void act({ action: "deleteMember", id: member.id }, "Membro aggiornato"); }}>Rimuovi</button>
          )}
        </div>
      </article>
    ))}</div>
  </div>;
}

function Metric({ label, value, note, tone }: { label: string; value: string | number; note: string; tone: string }) {
  return <div className={`metric metric--${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}
function PanelHead({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action: string; onAction: () => void }) {
  return <div className="panel-head"><div><span>{eyebrow}</span><h3>{title}</h3></div><button onClick={onAction}>{action}</button></div>;
}
function Field({ label, name, type = "text", wide = false, autoFocus = false, defaultValue, placeholder }: {
  label: string; name: string; type?: string; wide?: boolean; autoFocus?: boolean; defaultValue?: string; placeholder?: string;
}) {
  return <label className={wide ? "field field--wide" : "field"}><span>{label}</span><Input name={name} type={type} autoFocus={autoFocus} defaultValue={defaultValue} placeholder={placeholder} /></label>;
}
function Area({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) {
  return <label className="field field--wide"><span>{label}</span><Textarea name={name} defaultValue={defaultValue} rows={4} className="notes-input" /></label>;
}
function FormSelect({ label, name, rows, defaultValue }: { label: string; name: string; rows: Row[]; defaultValue?: string }) {
  const initial = defaultValue ?? (rows[0] ? String(rows[0].id) : undefined);
  const [value, setValue] = useState(initial);
  return <label className="field"><span>{label}</span>
    <input type="hidden" name={name} value={value || ""} />
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
      <SelectContent>{rows.map((row) => <SelectItem key={String(row.id)} value={String(row.id)}>{String(row.label || row.name || row.title)}</SelectItem>)}</SelectContent>
    </Select>
  </label>;
}
function Submit({ pending, label }: { pending: boolean; label: string }) {
  return <div className="form-submit"><Button className="primary-button" disabled={pending} type="submit">{pending ? "Salvo…" : label}</Button></div>;
}
function DocumentForm({ data, pending, setPending, setData, close, defaults, actorId }: {
  data: DashboardData; pending: boolean; setPending: (v: boolean) => void; setData: (d: DashboardData) => void; close: () => void;
  defaults: { leadId?: string; clientId?: string; kind?: string }; actorId: string;
}) {
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const form = new FormData(event.currentTarget);
      form.set("actorId", actorId);
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const next = await res.json() as DashboardData & { error?: string };
      if (!res.ok) throw new Error(next.error);
      setData(next);
      close();
      toast.success("Documento salvato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Caricamento non riuscito");
    } finally {
      setPending(false);
    }
  }
  return <form onSubmit={upload} className="form-grid">
    <FormSelect label="Tipo documento" name="kind" rows={DOC_KINDS.map((k) => ({ id: k.id, label: k.label }))} defaultValue={defaults.kind || "riassunto"} />
    <Field label="Nome (opzionale)" name="name" />
    <label className="field field--wide"><span>File (max 20 MB) — oppure solo link sotto</span><Input name="file" type="file" /></label>
    <Field label="Link esterno (Figma, Drive…)" name="externalUrl" wide placeholder="https://www.figma.com/..." />
    <FormSelect label="Collega a un lead" name="leadId" rows={[{ id: "_none", label: "Nessuno" }, ...data.leads.map((r) => ({ ...r, label: r.company }))]} defaultValue={defaults.leadId || "_none"} />
    <FormSelect label="Oppure a un cliente" name="clientId" rows={[{ id: "_none", label: "Nessuno" }, ...data.clients.map((r) => ({ ...r, label: r.company }))]} defaultValue={defaults.clientId || "_none"} />
    <Submit pending={pending} label="Salva documento" />
  </form>;
}
function toLocalInput(value: unknown) {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function modalTitle(modal: Modal) {
  return ({
    lead: "Nuovo lead", task: "Nuovo task", payment: "Nuovo movimento", template: "Nuovo lavoro standard",
    job: "Crea lavoro", document: "Salva documento", member: "Nuovo membro", convert: "Trasforma in cliente",
    call: "Registra chiamata", meeting: "Fissa videocall", proposal: "Salva proposta Figma",
    editJob: "Modifica lavoro", editLead: "Modifica lead", editClient: "Modifica cliente", editMember: "Modifica membro", note: "Nota interna",
  } as Record<string, string>)[modal || ""] || "";
}
function modalCopy(modal: Modal) {
  return ({
    lead: "Inserisci un contatto da Meta Ads o altra fonte.",
    task: "Una tantum o ricorrente, collegabile a cliente/lavoro.",
    payment: "Incasso oppure fattura ricorrente da emettere.",
    template: "Servizio riutilizzabile con checklist task automatici.",
    job: "Parte dal modello e genera onboarding → collaudo.",
    document: "File o link Figma, tipizzato (riassunto, proposta…).",
    member: "Aggiungi qualcuno al team con ruolo e permessi.",
    convert: "Chiude il lead e apre la scheda cliente (+ lavoro opzionale).",
    call: "Esito della prima chiamata o dei richiami.",
    meeting: "Data, ora e link della videocall gratuita.",
    proposal: "Salva il link Figma nella scheda e in archivio.",
    editJob: "Aggiorna stato, prezzo, scadenze e note.",
    editLead: "Anagrafica, fonte, appuntamento e note commerciali.",
    editClient: "Anagrafica e stato del cliente.",
    editMember: "Ruolo, colore, attivazione e permessi.",
    note: "Aggiungi una nota alla timeline del cliente.",
  } as Record<string, string>)[modal || ""] || "";
}
