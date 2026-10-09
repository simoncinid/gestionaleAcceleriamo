import { useMutation } from "@tanstack/react-query";
import { useRef, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Button, Card, Select, Textarea } from "../../components/ui";
import { fmtDateTime } from "../../format";
import { useRefreshLeads } from "../../hooks";
import type { Activity } from "../../types";

const TYPE_LABELS: Record<string, string> = {
  creazione: "Creato", nota: "Nota", chiamata: "Chiamata", email: "Email", cambio_fase: "Fase", meta: "Meta", documento: "Documento",
  cestino: "Cestino", ripristino: "Ripristino", unione: "Unione", migrazione: "Importato",
};

export function Timeline({ leadId, activities }: { leadId: string; activities: Activity[] }) {
  const refresh = useRefreshLeads();
  const formRef = useRef<HTMLFormElement>(null);
  const add = useMutation({
    mutationFn: (json: { type: string; body: string }) => api(`/leads/${leadId}/activities`, { method: "POST", json }),
    onSuccess: () => {
      formRef.current?.reset();
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    add.mutate({ type: String(f.get("type")), body: String(f.get("body") ?? "") });
  }
  return (
    <Card title="storico">
      <form ref={formRef} onSubmit={submit} className="mb-4 space-y-2">
        <Select name="type" defaultValue="chiamata" aria-label="Tipo">
          <option value="chiamata">Chiamata</option>
          <option value="nota">Nota</option>
          <option value="email">Email</option>
        </Select>
        <Textarea name="body" rows={3} required placeholder="Com'è andata?" aria-label="Testo" />
        <Button type="submit" disabled={add.isPending}>Aggiungi</Button>
      </form>
      <ol className="space-y-3">
        {activities.map((a) => (
          <li key={a.id} className="min-w-0 border-l-2 border-brand/30 pl-3">
            <p className="text-xs text-ink/50">{TYPE_LABELS[a.type] ?? a.type} · {a.authorName} · {fmtDateTime(a.createdAt)}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{a.body}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
