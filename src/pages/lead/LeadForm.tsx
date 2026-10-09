import type { FormEvent } from "react";
import { Button, Card, Field, Input, Select, Textarea } from "../../components/ui";
import { fromInput, toInput } from "../../format";
import type { Lead } from "../../types";

const TEXT_FIELDS: { key: "company" | "contactName" | "phone" | "email" | "website" | "meetLink" | "proposalUrl"; label: string; type?: string }[] = [
  { key: "company", label: "Azienda" },
  { key: "contactName", label: "Referente" },
  { key: "phone", label: "Telefono", type: "tel" },
  { key: "email", label: "Email", type: "email" },
  { key: "website", label: "Sito" },
  { key: "meetLink", label: "Link Meet", type: "url" },
  { key: "proposalUrl", label: "Link preventivo", type: "url" },
];

export function LeadForm({ lead, users, onSave, pending }: { lead: Lead; users: { id: string; name: string }[]; onSave: (p: Record<string, unknown>) => void; pending: boolean }) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    const patch: Record<string, unknown> = {};
    for (const { key } of TEXT_FIELDS) patch[key] = v(key) || null;
    patch.company = v("company");
    patch.ownerId = v("ownerId") || null;
    patch.estimatedValue = v("estimatedValue") ? Math.round(Number(v("estimatedValue"))) : null;
    patch.appointmentAt = fromInput(v("appointmentAt"));
    patch.notes = v("notes") || null;
    patch.linkedinText = v("linkedinText") || null;
    onSave(patch);
  }
  return (
    <Card title="dati">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map(({ key, label, type }) => (
          <Field key={key} label={label}>
            <Input name={key} type={type ?? "text"} defaultValue={lead[key] ?? ""} required={key === "company"} />
          </Field>
        ))}
        <Field label="Valore stimato (euro)"><Input name="estimatedValue" type="number" min={0} step={1} defaultValue={lead.estimatedValue ?? ""} /></Field>
        <Field label="Responsabile">
          <Select name="ownerId" defaultValue={lead.ownerId ?? ""}>
            <option value="">Nessuno</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Appuntamento"><Input name="appointmentAt" type="datetime-local" defaultValue={toInput(lead.appointmentAt)} /></Field>
        <Field label="Note" wide><Textarea name="notes" rows={4} defaultValue={lead.notes ?? ""} /></Field>
        <Field label="Profilo LinkedIn (testo incollato)" wide><Textarea name="linkedinText" rows={3} defaultValue={lead.linkedinText ?? ""} /></Field>
        <div className="sm:col-span-2"><Button type="submit" disabled={pending}>Salva i dati</Button></div>
      </form>
    </Card>
  );
}
