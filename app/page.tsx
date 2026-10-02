"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";

type Row = Record<string, string | number | boolean | null>;
type DashboardData = { stages: Row[]; members: Row[]; leads: Row[]; clients: Row[]; documents: Row[]; tasks: Row[]; payments: Row[]; templates: Row[]; jobs: Row[] };
type Section = "dashboard" | "leads" | "clients" | "tasks" | "finance" | "jobs";
type Modal = "lead" | "task" | "payment" | "template" | "job" | "document" | null;

const pipeline = [
  ["da-chiamare-prima-volta", "Da chiamare prima volta", "orange"], ["non-chiamato", "Non Chiamato", "neutral"],
  ["da-richiamare", "Da Richiamare", "yellow"], ["appuntamento-confermato", "Appuntamento confermato", "blue"],
  ["presentazione-confermata", "Presentazione Confermata", "violet"], ["in-attesa-preventivo", "In Attesa Preventivo", "orange"],
  ["in-attesa-decisione", "In attesa decisione", "yellow"], ["probabilmente-bloccato", "Probabilmente bloccato", "neutral"],
  ["chiuso", "Chiuso", "green"], ["non-chiuso", "Non Chiuso", "red"], ["fuori-target", "Fuori Target", "red"], ["fake", "Fake", "red"],
];
const initialData: DashboardData = { stages: pipeline.map(([id,label,tone], sortOrder) => ({ id,label,tone,sortOrder })), members: [], leads: [], clients: [], documents: [], tasks: [], payments: [], templates: [], jobs: [] };
const nav: { id: Section; label: string; icon: string }[] = [
  { id: "dashboard", label: "Panoramica", icon: "/icons/jobs.png" }, { id: "leads", label: "Lead", icon: "/icons/leads.png" },
  { id: "clients", label: "Clienti", icon: "/icons/clients.png" }, { id: "tasks", label: "Task", icon: "/icons/tasks.png" },
  { id: "finance", label: "Pagamenti", icon: "/icons/finance.png" }, { id: "jobs", label: "Lavori", icon: "/icons/jobs.png" },
];
const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const date = (value: unknown) => value ? new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(String(value))) : "—";

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) { return <span className={`badge badge--${tone}`}>{children}</span>; }
function Empty({ title, copy }: { title: string; copy: string }) { return <div className="empty"><span className="empty__orb"/><strong>{title}</strong><p>{copy}</p></div>; }

export default function Home() {
  const [data, setData] = useState<DashboardData>(initialData);
  const [section, setSection] = useState<Section>("dashboard");
  const [modal, setModal] = useState<Modal>(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    try { const res = await fetch("/api/dashboard"); if (!res.ok) throw new Error(); setData(await res.json()); }
    catch { toast.error("Connessione ai dati non disponibile"); }
    finally { setLoaded(true); }
  }
  useEffect(() => { void refresh(); }, []);

  async function act(payload: Record<string, unknown>, success?: string) {
    setPending(true);
    try {
      const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const next = await res.json() as DashboardData & { error?: string };
      if (!res.ok) throw new Error(next.error || "Errore di salvataggio");
      setData(next); setModal(null); if (success) toast.success(success);
      return next;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Errore di salvataggio"); }
    finally { setPending(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>, action: string, success: string) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()); await act({ action, ...values }, success);
  }

  useEffect(() => {
    const doc = document as Document & { modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> } };
    if (!doc.modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void doc.modelContext.registerTool({ name: "create_lead", title: "Crea lead", description: "Crea un nuovo lead manuale nel gestionale Acceleriamo.", inputSchema: { type: "object", properties: { company: { type: "string" }, contactName: { type: "string" }, email: { type: "string" } }, required: ["company"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => act({ action: "createLead", ...(input as Record<string, unknown>) }, "Lead creato") }, { signal: lifecycle.signal });
    void doc.modelContext.registerTool({ name: "list_open_tasks", title: "Elenca task aperti", description: "Restituisce i task ancora da completare.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: async () => data.tasks.filter((task) => task.status !== "done").map(({ id,title,dueDate,assigneeName }) => ({ id,title,dueDate,assigneeName })) }, { signal: lifecycle.signal });
    return () => lifecycle.abort();
  }, [data.tasks]);

  const stageMap = useMemo(() => new Map(data.stages.map((stage) => [stage.id, stage])), [data.stages]);
  const activeLeads = data.leads.filter((lead) => !["chiuso", "non-chiuso", "fuori-target", "fake"].includes(String(lead.statusId)));
  const openTasks = data.tasks.filter((task) => task.status !== "done");
  const dueTotal = data.payments.filter((payment) => payment.status === "due").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const receivedTotal = data.payments.filter((payment) => payment.status === "received").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setSection("dashboard")} aria-label="Apri la panoramica"><img src="/brand/acceleriamo-logo.png" alt="ACCELERIAMO" /></button>
      <nav aria-label="Navigazione principale">{nav.map((item) => <button key={item.id} className={section === item.id ? "nav-item is-active" : "nav-item"} onClick={() => setSection(item.id)}><img src={item.icon} alt=""/><span>{item.label}</span>{item.id === "tasks" && openTasks.length > 0 && <b>{openTasks.length}</b>}</button>)}</nav>
      <div className="sidebar-foot"><div className="avatar">DS</div><div><strong>Diego</strong><small>Amministratore</small></div></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><div><span className="eyebrow"><i/>ACCELERIAMO OS</span><h1>{nav.find((item) => item.id === section)?.label}</h1></div><div className="top-actions"><button className="search" onClick={() => toast("La ricerca globale arriva nel prossimo step")}>⌕ <span>Cerca</span><kbd>⌘ K</kbd></button><Button className="primary-button" onClick={() => setModal(section === "tasks" ? "task" : section === "finance" ? "payment" : section === "jobs" ? "job" : "lead")}>＋ Nuovo</Button></div></header>
      {!loaded ? <div className="loading-grid"><div/><div/><div/></div> : <>
        {section === "dashboard" && <Dashboard data={data} activeLeads={activeLeads} openTasks={openTasks} dueTotal={dueTotal} receivedTotal={receivedTotal} stageMap={stageMap} setSection={setSection} setModal={setModal} />}
        {section === "leads" && <Leads data={data} act={act} setModal={setModal} />}
        {section === "clients" && <Clients data={data} setModal={setModal} />}
        {section === "tasks" && <Tasks data={data} act={act} setModal={setModal} />}
        {section === "finance" && <Finance data={data} act={act} setModal={setModal} dueTotal={dueTotal} receivedTotal={receivedTotal} />}
        {section === "jobs" && <Jobs data={data} setModal={setModal} />}
      </>}
    </main>
    <Dialog open={modal !== null} onOpenChange={(open) => !open && setModal(null)}><DialogContent className="modal-card"><DialogHeader><DialogTitle>{modalTitle(modal)}</DialogTitle><DialogDescription>{modalCopy(modal)}</DialogDescription></DialogHeader>
      {modal === "lead" && <form onSubmit={(event) => submit(event, "createLead", "Lead creato")} className="form-grid"><Field label="Azienda *" name="company" autoFocus/><Field label="Contatto" name="contactName"/><Field label="Email" name="email" type="email"/><Field label="Telefono" name="phone"/><Field label="Valore stimato" name="estimatedValue" type="number"/><FormSelect label="Fase iniziale" name="statusId" rows={data.stages} defaultValue="non-chiamato"/><Field label="Note" name="notes" wide/><Submit pending={pending} label="Crea lead"/></form>}
      {modal === "task" && <form onSubmit={(event) => submit(event, "createTask", "Task assegnato")} className="form-grid"><Field label="Task *" name="title" autoFocus wide/><FormSelect label="Assegnatario" name="assigneeId" rows={data.members} defaultValue={String(data.members[0]?.id || "diego")}/><Field label="Scadenza" name="dueDate" type="date"/><FormSelect label="Priorità" name="priority" rows={[{id:"bassa",label:"Bassa"},{id:"media",label:"Media"},{id:"alta",label:"Alta"}]} defaultValue="media"/><Field label="Descrizione" name="description" wide/><Submit pending={pending} label="Assegna task"/></form>}
      {modal === "payment" && <form onSubmit={(event) => submit(event, "createPayment", "Pagamento registrato")} className="form-grid"><FormSelect label="Cliente *" name="clientId" rows={data.clients.map((row) => ({...row,label:row.company}))}/><Field label="Descrizione *" name="description"/><Field label="Importo" name="amount" type="number"/><FormSelect label="Tipo" name="kind" rows={[{id:"oneoff",label:"Una tantum"},{id:"recurring",label:"Ricorrente"}]} defaultValue="oneoff"/><Field label="Scadenza" name="dueDate" type="date"/><Field label="Prossima emissione" name="nextIssueAt" type="date"/><FormSelect label="Ricorrenza" name="recurrence" rows={[{id:"mensile",label:"Mensile"},{id:"trimestrale",label:"Trimestrale"},{id:"annuale",label:"Annuale"}]}/><Submit pending={pending} label="Salva movimento"/></form>}
      {modal === "template" && <form onSubmit={(event) => submit(event, "createTemplate", "Lavoro standard creato")} className="form-grid"><Field label="Nome lavoro *" name="title" autoFocus/><Field label="Prezzo base" name="defaultPrice" type="number"/><Field label="Durata in giorni" name="defaultDays" type="number"/><Field label="Descrizione" name="description" wide/><Submit pending={pending} label="Crea modello"/></form>}
      {modal === "job" && <form onSubmit={(event) => submit(event, "assignJob", "Lavoro assegnato")} className="form-grid"><FormSelect label="Cliente *" name="clientId" rows={data.clients.map((row) => ({...row,label:row.company}))}/><FormSelect label="Lavoro standard" name="templateId" rows={data.templates.map((row) => ({...row,label:row.title}))}/><Field label="Titolo personalizzato" name="title"/><Field label="Prezzo concordato" name="price" type="number"/><FormSelect label="Responsabile" name="ownerId" rows={data.members} defaultValue={String(data.members[0]?.id || "diego")}/><Field label="Inizio" name="startDate" type="date"/><Field label="Consegna" name="dueDate" type="date"/><Submit pending={pending} label="Assegna lavoro"/></form>}
      {modal === "document" && <DocumentForm data={data} pending={pending} setPending={setPending} setData={setData} close={() => setModal(null)}/>} 
    </DialogContent></Dialog>
    <Toaster richColors position="bottom-right" />
  </div>;
}

function Dashboard({ data, activeLeads, openTasks, dueTotal, receivedTotal, stageMap, setSection, setModal }: { data: DashboardData; activeLeads: Row[]; openTasks: Row[]; dueTotal: number; receivedTotal: number; stageMap: Map<unknown,Row>; setSection:(s:Section)=>void; setModal:(m:Modal)=>void }) {
  return <div className="page-stack"><section className="welcome"><div><span>Buongiorno, Diego</span><h2>Il lavoro che conta,<br/><em>tutto qui.</em></h2></div><div className="quick-actions"><button onClick={() => setModal("lead")}>＋ Lead</button><button onClick={() => setModal("task")}>＋ Task</button><button onClick={() => setModal("job")}>＋ Lavoro</button></div></section>
    <section className="metric-grid"><Metric label="Lead aperti" value={activeLeads.length} note={`${data.leads.length} totali`} tone="orange"/><Metric label="Task da fare" value={openTasks.length} note={`${openTasks.filter(t => t.priority === "alta").length} ad alta priorità`} tone="ink"/><Metric label="Da incassare" value={money.format(dueTotal)} note={`Incassati ${money.format(receivedTotal)}`} tone="cream"/><Metric label="Lavori attivi" value={data.jobs.filter(j => j.status !== "completato").length} note={`${data.templates.length} modelli pronti`} tone="green"/></section>
    <section className="dashboard-grid"><div className="panel pipeline-panel"><PanelHead eyebrow="Pipeline" title="Dove sono i lead" action="Apri pipeline" onAction={() => setSection("leads")}/><div className="pipeline-bars">{data.stages.filter(stage => Number(stage.sortOrder) <= 80).map((stage) => { const count = data.leads.filter(lead => lead.statusId === stage.id).length; const width = Math.max(5, count / Math.max(1,data.leads.length) * 100); return <div key={String(stage.id)} className="pipeline-row"><span>{stage.label}</span><div><i className={`tone-${stage.tone}`} style={{width:`${width}%`}}/></div><b>{count}</b></div>})}</div></div>
      <div className="panel"><PanelHead eyebrow="Oggi" title="Task in arrivo" action="Vedi tutti" onAction={() => setSection("tasks")}/>{openTasks.length ? <div className="mini-list">{openTasks.slice(0,5).map(task => <div key={String(task.id)}><span className={`check priority-${task.priority}`}/><div><strong>{task.title}</strong><small>{task.assigneeName || "Team"} · {date(task.dueDate)}</small></div></div>)}</div> : <Empty title="Tutto fatto" copy="Nessun task aperto in questo momento."/>}</div></section>
    <section className="panel"><PanelHead eyebrow="Opportunità" title="Lead recenti" action="Nuovo lead" onAction={() => setModal("lead")}/>{data.leads.length ? <Table><TableHeader><TableRow><TableHead>Azienda</TableHead><TableHead>Contatto</TableHead><TableHead>Fase</TableHead><TableHead className="text-right">Valore</TableHead></TableRow></TableHeader><TableBody>{data.leads.slice(0,5).map(lead => { const stage = stageMap.get(lead.statusId); return <TableRow key={String(lead.id)}><TableCell><strong>{lead.company}</strong></TableCell><TableCell>{lead.contactName || "—"}</TableCell><TableCell><Badge tone={String(stage?.tone)}>{stage?.label || lead.statusId}</Badge></TableCell><TableCell className="text-right">{money.format(Number(lead.estimatedValue || 0))}</TableCell></TableRow>})}</TableBody></Table> : <Empty title="La pipeline è pronta" copy="Inserisci il primo lead per iniziare."/>}</section>
  </div>;
}
function Metric({ label,value,note,tone }: { label:string; value:string|number; note:string; tone:string }) { return <div className={`metric metric--${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function PanelHead({ eyebrow,title,action,onAction }: { eyebrow:string; title:string; action:string; onAction:()=>void }) { return <div className="panel-head"><div><span>{eyebrow}</span><h3>{title}</h3></div><button onClick={onAction}>{action}</button></div>; }

function Leads({ data, act, setModal }: { data:DashboardData; act:(p:Record<string,unknown>,s?:string)=>Promise<unknown>; setModal:(m:Modal)=>void }) {
  return <div className="page-stack"><div className="section-intro"><p>Gestisci ogni opportunità dal primo contatto al cliente.</p><Button className="primary-button" onClick={() => setModal("lead")}>＋ Aggiungi lead</Button></div>
    <div className="panel table-panel">{data.leads.length ? <Table><TableHeader><TableRow><TableHead>Azienda</TableHead><TableHead>Contatto</TableHead><TableHead>Valore</TableHead><TableHead>Fase</TableHead><TableHead>Azioni</TableHead></TableRow></TableHeader><TableBody>{data.leads.map(lead => <TableRow key={String(lead.id)}><TableCell><div className="entity"><i>{String(lead.company).slice(0,2).toUpperCase()}</i><div><strong>{lead.company}</strong><small>{lead.email || "Nessuna email"}</small></div></div></TableCell><TableCell>{lead.contactName || "—"}</TableCell><TableCell>{money.format(Number(lead.estimatedValue || 0))}</TableCell><TableCell><Select value={String(lead.statusId)} onValueChange={(statusId) => act({action:"updateLeadStage",id:lead.id,statusId},"Fase aggiornata")}><SelectTrigger className="stage-select"><SelectValue/></SelectTrigger><SelectContent>{data.stages.map(stage => <SelectItem key={String(stage.id)} value={String(stage.id)}>{stage.label}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><div className="row-actions"><button onClick={() => setModal("document")}>Documento</button>{lead.statusId !== "chiuso" && <button className="strong" onClick={() => act({action:"convertLead",id:lead.id},"Lead trasformato in cliente")}>Trasforma in cliente</button>}</div></TableCell></TableRow>)}</TableBody></Table> : <Empty title="Nessun lead ancora" copy="Aggiungi il primo contatto e assegnagli una fase."/>}</div>
    {data.leads.length > 0 && <div className="stage-legend">{data.stages.map(stage => <span key={String(stage.id)}><i className={`tone-${stage.tone}`}/>{stage.label} <b>{data.leads.filter(l=>l.statusId===stage.id).length}</b></span>)}</div>}
  </div>;
}
function Clients({ data, setModal }: { data:DashboardData; setModal:(m:Modal)=>void }) { return <div className="page-stack"><div className="section-intro"><p>I clienti nati dai lead chiusi e i loro lavori attivi.</p><Button variant="outline" onClick={() => setModal("document")}>＋ Carica documento</Button></div>{data.clients.length ? <div className="client-grid">{data.clients.map(client => { const docs=data.documents.filter(d=>d.clientId===client.id); const jobs=data.jobs.filter(j=>j.clientId===client.id); return <article className="client-card" key={String(client.id)}><div className="client-card__top"><i>{String(client.company).slice(0,2).toUpperCase()}</i><Badge tone={jobs.length ? "green":"neutral"}>{jobs.length ? `${jobs.length} lavori` : "Nuovo"}</Badge></div><h3>{client.company}</h3><p>{client.contactName || "Contatto non indicato"}</p><a href={`mailto:${client.email}`}>{client.email || "Nessuna email"}</a><div className="client-card__meta"><span>{docs.length}<small>Documenti</small></span><span>{jobs.length}<small>Lavori</small></span></div></article>})}</div> : <Empty title="Nessun cliente" copy="Trasforma un lead chiuso per trovarlo qui."/>}</div>; }
function Tasks({ data, act, setModal }: { data:DashboardData; act:(p:Record<string,unknown>,s?:string)=>Promise<unknown>; setModal:(m:Modal)=>void }) { return <div className="page-stack"><div className="section-intro"><p>Assegna attività, scadenze e priorità al team.</p><Button className="primary-button" onClick={() => setModal("task")}>＋ Nuovo task</Button></div>{data.tasks.length ? <div className="task-board"><section><h3>Da fare <b>{data.tasks.filter(t=>t.status!=="done").length}</b></h3>{data.tasks.filter(t=>t.status!=="done").map(task => <button className="task-card" key={String(task.id)} onClick={() => act({action:"toggleTask",id:task.id},"Task completato")}><span className={`check priority-${task.priority}`}/><div><strong>{task.title}</strong><p>{task.description || "Nessuna nota"}</p><small>{task.assigneeName} · {date(task.dueDate)}</small></div></button>)}</section><section><h3>Completati <b>{data.tasks.filter(t=>t.status==="done").length}</b></h3>{data.tasks.filter(t=>t.status==="done").map(task => <button className="task-card is-done" key={String(task.id)} onClick={() => act({action:"toggleTask",id:task.id},"Task riaperto")}><span className="check"/><div><strong>{task.title}</strong><small>{task.assigneeName}</small></div></button>)}</section></div> : <Empty title="Agenda libera" copy="Crea il primo task e assegnalo a un membro del team."/>}</div>; }
function Finance({ data, act, setModal, dueTotal, receivedTotal }: { data:DashboardData; act:(p:Record<string,unknown>,s?:string)=>Promise<unknown>; setModal:(m:Modal)=>void; dueTotal:number; receivedTotal:number }) { return <div className="page-stack"><div className="metric-grid finance-metrics"><Metric label="Incassato" value={money.format(receivedTotal)} note="Pagamenti ricevuti" tone="green"/><Metric label="Da incassare" value={money.format(dueTotal)} note="Pagamenti aperti" tone="orange"/><Metric label="Ricorrenti" value={data.payments.filter(p=>p.kind==="recurring").length} note="Fatture programmate" tone="ink"/></div><div className="section-intro"><p>Pagamenti ricevuti e fatture ricorrenti da emettere.</p><Button className="primary-button" onClick={() => setModal("payment")}>＋ Registra</Button></div><div className="panel table-panel">{data.payments.length ? <Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Voce</TableHead><TableHead>Tipo</TableHead><TableHead>Scadenza</TableHead><TableHead>Importo</TableHead><TableHead>Stato</TableHead></TableRow></TableHeader><TableBody>{data.payments.map(payment => <TableRow key={String(payment.id)}><TableCell><strong>{payment.clientName}</strong></TableCell><TableCell>{payment.description}</TableCell><TableCell>{payment.kind==="recurring" ? <Badge tone="violet">{payment.recurrence || "Ricorrente"}</Badge> : "Una tantum"}</TableCell><TableCell>{date(payment.dueDate || payment.nextIssueAt)}</TableCell><TableCell>{money.format(Number(payment.amount))}</TableCell><TableCell>{payment.status==="received" ? <Badge tone="green">Ricevuto</Badge> : <button className="mark-paid" onClick={() => act({action:"markPaymentReceived",id:payment.id},"Pagamento segnato come ricevuto")}>Segna ricevuto</button>}</TableCell></TableRow>)}</TableBody></Table> : <Empty title="Nessun movimento" copy="Registra un pagamento o una fattura ricorrente."/>}</div></div>; }
function Jobs({ data, setModal }: { data:DashboardData; setModal:(m:Modal)=>void }) { return <div className="page-stack"><div className="section-intro"><p>Crea servizi standard e assegnali rapidamente ai clienti.</p><div className="button-pair"><Button variant="outline" onClick={() => setModal("template")}>＋ Nuovo modello</Button><Button className="primary-button" onClick={() => setModal("job")}>＋ Assegna lavoro</Button></div></div><div className="template-grid">{data.templates.map(template => <article className="template-card" key={String(template.id)}><img src="/icons/jobs.png" alt=""/><span>MODELLO</span><h3>{template.title}</h3><p>{template.description}</p><div><b>{money.format(Number(template.defaultPrice))}</b><small>{template.defaultDays} giorni</small></div></article>)}</div><div className="panel"><PanelHead eyebrow="Produzione" title="Lavori assegnati" action="Assegna lavoro" onAction={() => setModal("job")}/>{data.jobs.length ? <Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Lavoro</TableHead><TableHead>Responsabile</TableHead><TableHead>Consegna</TableHead><TableHead>Stato</TableHead></TableRow></TableHeader><TableBody>{data.jobs.map(job => <TableRow key={String(job.id)}><TableCell><strong>{job.clientName}</strong></TableCell><TableCell>{job.title}</TableCell><TableCell>{job.ownerName}</TableCell><TableCell>{date(job.dueDate)}</TableCell><TableCell><Badge tone="blue">{job.status}</Badge></TableCell></TableRow>)}</TableBody></Table> : <Empty title="Nessun lavoro assegnato" copy="Scegli un modello e collegalo a un cliente."/>}</div></div>; }

function Field({ label,name,type="text",wide=false,autoFocus=false }: {label:string;name:string;type?:string;wide?:boolean;autoFocus?:boolean}) { return <label className={wide ? "field field--wide":"field"}><span>{label}</span><Input name={name} type={type} autoFocus={autoFocus}/></label>; }
function FormSelect({ label,name,rows,defaultValue }: {label:string;name:string;rows:Row[];defaultValue?:string}) { return <label className="field"><span>{label}</span><Select name={name} defaultValue={defaultValue}><SelectTrigger><SelectValue placeholder="Seleziona"/></SelectTrigger><SelectContent>{rows.map(row => <SelectItem key={String(row.id)} value={String(row.id)}>{String(row.label || row.name || row.title)}</SelectItem>)}</SelectContent></Select></label>; }
function Submit({pending,label}:{pending:boolean;label:string}) { return <div className="form-submit"><Button className="primary-button" disabled={pending} type="submit">{pending ? "Salvo…":label}</Button></div>; }
function DocumentForm({data,pending,setPending,setData,close}:{data:DashboardData;pending:boolean;setPending:(v:boolean)=>void;setData:(d:DashboardData)=>void;close:()=>void}) { async function upload(event:FormEvent<HTMLFormElement>){event.preventDefault();setPending(true);try{const res=await fetch("/api/documents",{method:"POST",body:new FormData(event.currentTarget)});const next=await res.json() as DashboardData & {error?:string};if(!res.ok)throw new Error(next.error);setData(next);close();toast.success("Documento caricato");}catch(e){toast.error(e instanceof Error?e.message:"Caricamento non riuscito");}finally{setPending(false);}} return <form onSubmit={upload} className="form-grid"><label className="field field--wide"><span>File (massimo 20 MB)</span><Input name="file" type="file" required/></label><FormSelect label="Collega a un lead" name="leadId" rows={data.leads.map(r=>({...r,label:r.company}))}/><FormSelect label="Oppure a un cliente" name="clientId" rows={data.clients.map(r=>({...r,label:r.company}))}/><Submit pending={pending} label="Carica documento"/></form>; }
function modalTitle(modal:Modal){return ({lead:"Nuovo lead",task:"Nuovo task",payment:"Nuovo movimento",template:"Nuovo lavoro standard",job:"Assegna un lavoro",document:"Carica documento"} as Record<string,string>)[modal || ""] || "";}
function modalCopy(modal:Modal){return ({lead:"Aggiungi manualmente una nuova opportunità.",task:"Definisci cosa fare, chi se ne occupa e quando.",payment:"Registra un incasso oppure una fattura da emettere.",template:"Crea un servizio riutilizzabile per i prossimi clienti.",job:"Parti da un modello e personalizza l'incarico.",document:"Il file sarà salvato nell'archivio privato del contatto."} as Record<string,string>)[modal || ""] || "";}
