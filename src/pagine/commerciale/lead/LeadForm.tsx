import { useState } from "react";
import { AreaTesto, Campo, CampoQuando, Pulsante, Selettore } from "../../../ds";
import type { Lead } from "../../../types";

type CampoTesto = "company" | "contactName" | "phone" | "email" | "website" | "meetLink" | "proposalUrl";

const CAMPI: { key: CampoTesto; label: string; type?: string; inputMode?: "tel" | "email" | "url" }[] = [
  { key: "company", label: "Azienda" },
  { key: "contactName", label: "Referente" },
  { key: "phone", label: "Telefono", type: "tel", inputMode: "tel" },
  { key: "email", label: "Email", type: "email", inputMode: "email" },
  { key: "website", label: "Sito", inputMode: "url" },
  { key: "meetLink", label: "Link Meet", type: "url", inputMode: "url" },
  { key: "proposalUrl", label: "Link preventivo", type: "url", inputMode: "url" },
];

const NESSUNO = "nessuno";

// Dati del lead in un modulo controllato: responsabile con il selettore, appuntamento con CampoQuando.
// Chi lo usa lo rimonta (key) quando il lead cambia sul server, così riparte dai valori salvati.
export function LeadForm({ lead, users, onSave, pending }: { lead: Lead; users: { id: string; name: string }[]; onSave: (p: Record<string, unknown>) => void; pending: boolean }) {
  const [testi, setTesti] = useState<Record<CampoTesto, string>>(() => Object.fromEntries(CAMPI.map(({ key }) => [key, lead[key] ?? ""])) as Record<CampoTesto, string>);
  const [valore, setValore] = useState(lead.estimatedValue != null ? String(lead.estimatedValue) : "");
  const [owner, setOwner] = useState(lead.ownerId ?? NESSUNO);
  const [appuntamento, setAppuntamento] = useState<number | null>(lead.appointmentAt);
  const [note, setNote] = useState(lead.notes ?? "");
  const [linkedin, setLinkedin] = useState(lead.linkedinText ?? "");
  const numero = valore.trim() ? Number(valore.replace(/\./g, "").replace(",", ".")) : null;

  function salva() {
    const patch: Record<string, unknown> = {};
    for (const { key } of CAMPI) patch[key] = testi[key].trim() || null;
    patch.company = testi.company.trim();
    patch.ownerId = owner === NESSUNO ? null : owner;
    patch.estimatedValue = numero == null ? null : Math.round(numero);
    patch.appointmentAt = appuntamento;
    patch.notes = note.trim() || null;
    patch.linkedinText = linkedin.trim() || null;
    onSave(patch);
  }
  const manca = !testi.company.trim() ? "Serve il nome dell'azienda" : numero != null && (Number.isNaN(numero) || numero < 0) ? "Il valore stimato va scritto in euro" : undefined;

  return (
    <div className="flex flex-col gap-3">
      {CAMPI.map(({ key, label, type, inputMode }) => (
        <Campo key={key} etichetta={label} type={type ?? "text"} inputMode={inputMode} value={testi[key]} onChange={(e) => setTesti((t) => ({ ...t, [key]: e.target.value }))} />
      ))}
      <Campo etichetta="Valore stimato (euro)" inputMode="numeric" value={valore} onChange={(e) => setValore(e.target.value)} />
      <Selettore etichetta="Responsabile" valore={owner} onCambia={setOwner}
        opzioni={[{ valore: NESSUNO, etichetta: "Nessuno" }, ...users.map((u) => ({ valore: u.id, etichetta: u.name }))]} />
      <CampoQuando etichetta="Appuntamento" valore={appuntamento} onCambia={setAppuntamento} />
      <AreaTesto etichetta="Note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
      <AreaTesto etichetta="Profilo LinkedIn (testo incollato)" rows={3} value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
      <Pulsante variante="secondario" className="self-start" inCorso={pending} motivoSpento={manca} onClick={salva}>Salva i dati</Pulsante>
    </div>
  );
}
