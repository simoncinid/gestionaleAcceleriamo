import { useMutation } from "@tanstack/react-query";
import { useRef, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "../../../api";
import { Button, Card, Input } from "../../../components/ui";
import { useRefreshLeads } from "../../../hooks";
import type { DocumentRow } from "../../../types";

export function Documents({ leadId, documents }: { leadId: string; documents: DocumentRow[] }) {
  const refresh = useRefreshLeads();
  const formRef = useRef<HTMLFormElement>(null);
  const add = useMutation({
    mutationFn: (json: { name: string; url: string }) => api(`/leads/${leadId}/documents`, { method: "POST", json }),
    onSuccess: () => {
      formRef.current?.reset();
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    add.mutate({ name: String(f.get("name") ?? ""), url: String(f.get("url") ?? "") });
  }
  return (
    <Card title="documenti">
      <ul className="mb-4 space-y-2 text-sm">
        {documents.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2">
            {d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all text-brand underline">{d.name}</a> : <span className="min-w-0 break-all">{d.name}</span>}
            <button type="button" className="shrink-0 text-xs text-ink/40 hover:text-red-700" onClick={() => confirm(`Togliere "${d.name}"?`) && remove.mutate(d.id)}>Togli</button>
          </li>
        ))}
        {!documents.length && <li className="text-ink/50">Nessun documento.</li>}
      </ul>
      <form ref={formRef} onSubmit={submit} className="space-y-2">
        <Input name="name" placeholder="Nome (es. Preventivo)" required aria-label="Nome del documento" />
        <Input name="url" type="url" placeholder="Link (Drive, Docs...)" required aria-label="Link del documento" />
        <Button type="submit" variant="ghost" disabled={add.isPending}>Aggiungi link</Button>
      </form>
    </Card>
  );
}
