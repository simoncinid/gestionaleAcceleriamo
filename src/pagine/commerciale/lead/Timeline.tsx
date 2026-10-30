import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../api";
import { AreaTesto, Pulsante, Selettore, cx } from "../../../ds";
import { momento } from "../../../format";
import { useRefreshLeads } from "../../../hooks";
import type { Activity } from "../../../types";
import { ELENCO, SECONDARIO } from "./stile";

const TIPI = [{ valore: "nota", etichetta: "Nota" }, { valore: "chiamata", etichetta: "Chiamata" }, { valore: "email", etichetta: "Email" }] as const;
type Tipo = (typeof TIPI)[number]["valore"];

// Nome breve del tipo di voce, in testa alla riga. Le voci scritte dal sistema sono in grigio.
const NOME_TIPO: Record<string, string> = {
  creazione: "Arrivo", nota: "Nota", chiamata: "Chiamata", email: "Email", cambio_fase: "Fase", meta: "Meta", documento: "Documento",
  cestino: "Cestino", ripristino: "Ripristino", unione: "Unione", migrazione: "Importato", esito: "Esito", call: "Call",
  proposta: "Proposta", foglio: "Foglio", ia: "Assistente", email_auto: "Email automatica", contatto: "Contatto",
};
const AUTOMATICI = new Set(["creazione", "cambio_fase", "meta", "migrazione", "foglio", "ia", "email_auto", "call", "proposta", "cestino", "ripristino", "unione"]);
export const automatica = (a: Pick<Activity, "type" | "authorId">) => a.authorId == null || AUTOMATICI.has(a.type);

// Storico: in cima "Cosa è successo" con il tipo (Nota di default) e Aggiungi, attivo solo con del testo;
// sotto la cronologia dal più recente, una voce per riga: tipo e testo, poi chi e quando.
export function Timeline({ leadId, activities, ora, compatta = false }: { leadId: string; activities: Activity[]; ora: number; compatta?: boolean }) {
  const refresh = useRefreshLeads();
  const [tipo, setTipo] = useState<Tipo>("nota");
  const [testo, setTesto] = useState("");
  const add = useMutation({
    mutationFn: () => api(`/leads/${leadId}/activities`, { method: "POST", json: { type: tipo, body: testo.trim() } }),
    onSuccess: () => { setTesto(""); toast.success("Aggiunto allo storico"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="flex flex-col gap-4">
      {!compatta && <div className="flex flex-col gap-3">
        <AreaTesto etichetta="Cosa è successo" rows={2} value={testo} onChange={(e) => setTesto(e.target.value)} />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <Selettore etichetta="Tipo" valore={tipo} opzioni={[...TIPI]} onCambia={setTipo} />
          <Pulsante variante="secondario" inCorso={add.isPending} motivoSpento={testo.trim() ? undefined : "Scrivi cosa è successo"} onClick={() => add.mutate()}>
            Aggiungi
          </Pulsante>
        </div>
      </div>}
      {activities.length === 0 ? <p className={SECONDARIO}>Nessun contatto ancora: la prima chiamata è il primo passo.</p> : (
        <ol className={ELENCO}>
          {activities.map((a) => {
            const auto = automatica(a);
            return (
              <li key={a.id} className="flex min-w-0 flex-col gap-0.5 py-3">
                <p className={cx("whitespace-pre-wrap break-words text-[15px] leading-6", auto && "text-[#6B645C]")}>
                  <span className="pr-2 text-[13px] font-semibold text-[#6B645C]">{NOME_TIPO[a.type] ?? a.type}</span>{a.body}
                </p>
                <p className={`${SECONDARIO} tabular-nums`}>{a.authorName}, {momento(a.createdAt, ora)}</p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
