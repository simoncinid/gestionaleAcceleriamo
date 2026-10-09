import { useState } from "react";
import { AreaTesto, Campo, Pulsante, Selettore } from "../../../ds";
import { euro, momento } from "../../../format";
import type { Lead } from "../../../types";
import { Dato } from "./Dato";

type CampoTesto = "company" | "contactName" | "phone" | "email" | "website";

const CAMPI: { key: CampoTesto; label: string; type?: string; inputMode?: "tel" | "email" | "url" }[] = [
  { key: "company", label: "Azienda" },
  { key: "contactName", label: "Referente" },
  { key: "phone", label: "Telefono", type: "tel", inputMode: "tel" },
  { key: "email", label: "Email", type: "email", inputMode: "email" },
  { key: "website", label: "Sito", inputMode: "url" },
];

const NESSUNO = "nessuno";

export type StatoDati = { testi: Record<CampoTesto, string>; owner: string; note: string; linkedin: string };

export const statoDati = (lead: Lead): StatoDati => ({
  testi: Object.fromEntries(CAMPI.map(({ key }) => [key, lead[key] ?? ""])) as Record<CampoTesto, string>,
  owner: lead.ownerId ?? NESSUNO,
  note: lead.notes ?? "",
  linkedin: lead.linkedinText ?? "",
});

// Corpo del PATCH dei dati. Spec 18: valore stimato, appuntamento, link Meet e link preventivo in 1B sono di sola lettura e non partono mai.
export function corpoDati(s: StatoDati): Record<string, unknown> {
  const corpo: Record<string, unknown> = {};
  for (const { key } of CAMPI) corpo[key] = s.testi[key].trim() || null;
  corpo.company = s.testi.company.trim();
  corpo.ownerId = s.owner === NESSUNO ? null : s.owner;
  corpo.notes = s.note.trim() || null;
  corpo.linkedinText = s.linkedin.trim() || null;
  return corpo;
}

// Dati del lead in un modulo controllato, responsabile con il selettore. Chi lo usa lo rimonta (key) solo dopo un salvataggio
// del modulo riuscito: gli altri salvataggi della scheda non cancellano quello che si sta scrivendo.
export function LeadForm({ lead, users, ora, onSave, pending }: { lead: Lead; users: { id: string; name: string }[]; ora: number; onSave: (p: Record<string, unknown>) => void; pending: boolean }) {
  const [s, setS] = useState<StatoDati>(() => statoDati(lead));
  const manca = !s.testi.company.trim() ? "Serve il nome dell'azienda" : undefined;
  const sola = lead.estimatedValue != null || lead.appointmentAt != null || lead.meetLink || lead.proposalUrl;

  return (
    <div className="flex flex-col gap-3">
      {CAMPI.map(({ key, label, type, inputMode }) => (
        <Campo key={key} etichetta={label} type={type ?? "text"} inputMode={inputMode} value={s.testi[key]}
          onChange={(e) => { const v = e.target.value; setS((p) => ({ ...p, testi: { ...p.testi, [key]: v } })); }} />
      ))}
      <Selettore etichetta="Responsabile" valore={s.owner} onCambia={(owner) => setS((p) => ({ ...p, owner }))}
        opzioni={[{ valore: NESSUNO, etichetta: "Nessuno" }, ...users.map((u) => ({ valore: u.id, etichetta: u.name }))]} />
      <AreaTesto etichetta="Note" rows={4} value={s.note} onChange={(e) => { const v = e.target.value; setS((p) => ({ ...p, note: v })); }} />
      <AreaTesto etichetta="Profilo LinkedIn (testo incollato)" rows={3} value={s.linkedin} onChange={(e) => { const v = e.target.value; setS((p) => ({ ...p, linkedin: v })); }} />
      <Pulsante variante="secondario" className="self-start" inCorso={pending} motivoSpento={manca} onClick={() => onSave(corpoDati(s))}>Salva i dati</Pulsante>
      {sola && (
        <dl aria-label="Dati di sola lettura" className="flex flex-col divide-y divide-sabbia border-t border-sabbia pt-1">
          {lead.estimatedValue != null && <Dato etichetta="Valore stimato">{euro(lead.estimatedValue * 100)}</Dato>}
          {lead.appointmentAt != null && <Dato etichetta="Appuntamento">{momento(lead.appointmentAt, ora)}</Dato>}
          {lead.meetLink && <Dato etichetta="Link Meet"><a href={lead.meetLink} target="_blank" rel="noreferrer" className="text-accento-testo underline-offset-4 hover:underline">{lead.meetLink}</a></Dato>}
          {lead.proposalUrl && <Dato etichetta="Link preventivo"><a href={lead.proposalUrl} target="_blank" rel="noreferrer" className="text-accento-testo underline-offset-4 hover:underline">{lead.proposalUrl}</a></Dato>}
        </dl>
      )}
    </div>
  );
}
