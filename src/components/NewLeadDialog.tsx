import { useMutation } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "../api";
import { fromInput } from "../format";
import { useRefreshLeads, useUsers } from "../hooks";
import type { Lead } from "../types";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

export function NewLeadDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const refresh = useRefreshLeads();
  const users = useUsers();
  const create = useMutation({
    mutationFn: (json: Record<string, unknown>) => api<{ lead: Lead }>("/leads", { method: "POST", json }),
    onSuccess: ({ lead }) => {
      refresh();
      toast.success(lead.duplicateOfId ? "Lead creato: sembra un doppione, controlla la scheda" : "Lead creato");
      onClose();
      navigate(`/commerciale/lead/${lead.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim() || undefined;
    create.mutate({
      company: s("company") ?? "",
      contactName: s("contactName"),
      phone: s("phone"),
      email: s("email"),
      website: s("website"),
      source: s("source"),
      ownerId: s("ownerId"),
      nextAction: s("nextAction"),
      nextActionAt: fromInput(String(f.get("nextActionAt") ?? "")) ?? undefined,
      notes: s("notes"),
    });
  }

  return (
    <Modal title="nuovo lead" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Azienda" wide><Input name="company" required autoFocus /></Field>
        <Field label="Referente"><Input name="contactName" /></Field>
        <Field label="Telefono"><Input name="phone" type="tel" /></Field>
        <Field label="Email"><Input name="email" type="email" /></Field>
        <Field label="Sito"><Input name="website" placeholder="azienda.it" /></Field>
        <Field label="Da dove arriva">
          <Select name="source" defaultValue="manuale">
            <option value="manuale">A mano</option>
            <option value="sito">Sito</option>
            <option value="passaparola">Passaparola</option>
            <option value="altro">Altro</option>
          </Select>
        </Field>
        <Field label="Responsabile">
          <Select name="ownerId" defaultValue="">
            <option value="">Nessuno</option>
            {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Prossima azione"><Input name="nextAction" placeholder="Prima chiamata" /></Field>
        <Field label="Quando"><Input name="nextActionAt" type="datetime-local" /></Field>
        <Field label="Note" wide><Textarea name="notes" rows={3} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={create.isPending}>Crea lead</Button>
        </div>
      </form>
    </Modal>
  );
}
