import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "../../api";
import { Campo, Foglio, Pulsante, Selettore } from "../../ds";
import { linkTel } from "../../format";
import type { Lead } from "../../types";
import { avviaContatto } from "./chiamata";

// Provenienza dei lead a mano (spec 6.1), dalla più frequente. Meta e il foglio arrivano da soli.
const FONTI_A_MANO = [
  { valore: "manuale", etichetta: "A mano" },
  { valore: "passaparola", etichetta: "Passaparola" },
  { valore: "sito", etichetta: "Sito" },
  { valore: "altro", etichetta: "Altro" },
] as const;
type Fonte = (typeof FONTI_A_MANO)[number]["valore"];

// Quattro campi (spec 6.1, "Inserimento a mano"): la prossima azione la mette il server (prima chiamata, adesso).
export function FoglioNuovoLead({ onChiudi }: { onChiudi: () => void }) {
  const qc = useQueryClient();
  const vai = useNavigate();
  const [v, setV] = useState({ company: "", contactName: "", phone: "" });
  const [fonte, setFonte] = useState<Fonte>("manuale");
  const crea = useMutation({
    mutationFn: (poi: "chiama" | "apri") =>
      api<{ lead: Lead }>("/leads", { method: "POST", json: { ...v, source: fonte } }).then((r) => ({ lead: r.lead, poi })),
    onSuccess: ({ lead, poi }) => {
      toast.success("Lead salvato");
      void qc.invalidateQueries({ queryKey: ["today"] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["badge"] });
      onChiudi();
      if (poi === "chiama" && lead.phone) {
        avviaContatto(lead.id, "chiamata");
        window.location.href = linkTel(lead.phone);
      } else {
        vai(`/commerciale/lead/${lead.id}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const manca = !v.company.trim() ? "Serve il nome dell'azienda" : undefined;
  const campo = (k: keyof typeof v) => ({ value: v[k], onChange: (e: ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value })) });

  return (
    <Foglio aperto titolo="Nuovo lead" onChiudi={onChiudi}
      principale={
        <div className="grid gap-2">
          <Pulsante variante="primario" misura="lg" className="w-full" inCorso={crea.isPending && crea.variables === "chiama"} disabled={crea.isPending}
            motivoSpento={manca ?? (!v.phone.trim() ? "Serve il telefono per chiamare" : undefined)} onClick={() => crea.mutate("chiama")}>Salva e chiama</Pulsante>
          <Pulsante variante="fantasma" misura="lg" className="w-full" inCorso={crea.isPending && crea.variables === "apri"} disabled={crea.isPending}
            motivoSpento={manca} onClick={() => crea.mutate("apri")}>Salva e apri la scheda</Pulsante>
        </div>
      }>
      <div className="flex flex-col gap-4">
        <Campo etichetta="Azienda" placeholder="Es. Officina Bertini" autoFocus {...campo("company")} />
        <Campo etichetta="Referente" placeholder="Nome e cognome" autoComplete="off" {...campo("contactName")} />
        <Campo etichetta="Telefono" type="tel" inputMode="tel" placeholder="+39" {...campo("phone")} />
        <Selettore etichetta="Provenienza" opzioni={[...FONTI_A_MANO]} valore={fonte} onCambia={setFonte} />
        <p className="text-secondaria text-grigio">Parte in Da chiamare prima volta, con la prima chiamata entro 2 ore.</p>
      </div>
    </Foglio>
  );
}
