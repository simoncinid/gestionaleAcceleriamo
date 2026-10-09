import type { FormEvent } from "react";
import { Button, Card, Field, Input } from "../../components/ui";
import { fromInput, toInput } from "../../format";
import type { Lead, Stage } from "../../types";

export function NextActionCard({ lead, kind, onSave, pending }: { lead: Lead; kind?: Stage["kind"]; onSave: (p: Record<string, unknown>) => void; pending: boolean }) {
  if (kind && kind !== "open") {
    return (
      <Card title="prossima azione">
        <p className="text-sm text-ink/60">Lead {kind === "won" ? "chiuso" : "perso"}: nessuna azione da fare.</p>
      </Card>
    );
  }
  const overdue = lead.nextActionAt != null && lead.nextActionAt < Date.now();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    onSave({ nextAction: String(f.get("nextAction") ?? "").trim() || null, nextActionAt: fromInput(String(f.get("nextActionAt") ?? "")) });
  }
  return (
    <Card title="prossima azione" accent={overdue}>
      <form key={`${lead.nextAction}-${lead.nextActionAt}`} onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
        <Field label="Cosa fare"><Input name="nextAction" defaultValue={lead.nextAction ?? ""} required /></Field>
        <Field label="Quando"><Input name="nextActionAt" type="datetime-local" defaultValue={toInput(lead.nextActionAt)} required /></Field>
        <Button type="submit" disabled={pending}>Salva</Button>
      </form>
      {overdue && <p className="mt-2 text-sm font-medium text-red-700">Scaduta</p>}
    </Card>
  );
}
