import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "../../api";
import { Campo, CampoGiorno, Foglio, Pulsante, Selettore, type Opzione } from "../../ds";
import { euro } from "../../format";
import type { DocumentRow } from "../../types";
import { centesimi } from "../commerciale/scheda";
import { useCliente } from "../dati-gestione";
import { useModelliLavoro, useRicaricaLavori } from "./dati";

const LINK = "__link";
const NESSUNO = "__nessuno";

// Un documento del passaggio: uno di quelli già sul lead, un link nuovo oppure nessuno.
function ScegliDocumento({ etichetta, documenti, valore, onCambia, link, onLink }: { etichetta: string; documenti: DocumentRow[]; valore: string | null; onCambia: (v: string) => void; link: string; onLink: (v: string) => void }) {
  const opzioni: Opzione<string>[] = [
    ...documenti.map((d) => ({ valore: d.id, etichetta: d.name })),
    { valore: LINK, etichetta: "Incolla un link" },
    { valore: NESSUNO, etichetta: "Per ora nessuno" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <Selettore etichetta={etichetta} opzioni={opzioni} valore={valore} onCambia={onCambia} />
      {valore === LINK && <Campo etichetta={`${etichetta}: link`} type="url" inputMode="url" placeholder="https://drive.google.com/..." value={link} onChange={(e) => onLink(e.target.value)} />}
    </div>
  );
}

// Passaggio da lead a cliente (e "Assegna un lavoro" dalla scheda cliente): documenti, lavoro tipo, avvio, canone.
// Conferma: crea il cliente se manca, il lavoro e le task una tantum.
export function FoglioAvvioLavoro({ leadId, clientId, nomeCliente, canoneIniziale, documenti = [], onChiudi }: {
  leadId?: string; clientId?: string; nomeCliente: string; canoneIniziale?: number | null; documenti?: DocumentRow[]; onChiudi: () => void;
}) {
  const vai = useNavigate();
  const ricarica = useRicaricaLavori();
  const modelli = useModelliLavoro();
  const cliente = useCliente(clientId ?? "");
  const [contratto, setContratto] = useState<string | null>(() => documenti.find((d) => /contratt/i.test(d.name))?.id ?? (leadId ? LINK : null));
  const [linkContratto, setLinkContratto] = useState("");
  const [bozza, setBozza] = useState<string | null>(() => documenti.find((d) => /bozza|preventiv|propost/i.test(d.name))?.id ?? (leadId ? LINK : null));
  const [linkBozza, setLinkBozza] = useState("");
  const [modello, setModello] = useState<string | null>(null);
  const [avvio, setAvvio] = useState<number | null>(null);
  const [canone, setCanone] = useState<string | null>(null);
  const [automazione, setAutomazione] = useState<string | null>(null);
  const lista = modelli.data ?? [];
  const scelto = modello ?? (lista.length === 1 ? lista[0].id : null);
  const canoneTesto = canone ?? (canoneIniziale ? String(canoneIniziale / 100).replace(".", ",") : "");
  const feeCents = centesimi(canoneTesto);
  const documentiNuovi = [
    contratto === LINK && linkContratto.trim() ? { name: "Contratto", url: linkContratto.trim() } : null,
    bozza === LINK && linkBozza.trim() ? { name: "Bozza del lavoro", url: linkBozza.trim() } : null,
  ].filter((d): d is { name: string; url: string } => d != null);
  const manca = !scelto ? "Scegli il lavoro tipo" : avvio == null ? "Scegli la data di avvio" : canoneTesto.trim() && feeCents == null ? "Scrivi il canone in euro" : undefined;
  const salva = useMutation({
    mutationFn: () => api<{ clientId: string; task: number }>("/jobs", { method: "POST", json: { ...(clientId ? { clientId } : {}), ...(leadId ? { leadId } : {}), clientName: nomeCliente, templateId: scelto, startAt: avvio, feeCents: feeCents ?? null, automationId: automazione, ...(leadId && documentiNuovi.length ? { documenti: documentiNuovi } : {}) } }),
    onSuccess: (r) => { toast.success(`Lavoro avviato, ${r.task} task create`); ricarica(); onChiudi(); vai(`/commerciale/clienti/${r.clientId}`); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Foglio aperto titolo={leadId ? "Passa a cliente" : "Assegna un lavoro"} onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={manca} onClick={() => salva.mutate()}>Avvia il lavoro</Pulsante>}>
      <p className="text-testo font-semibold">{nomeCliente}</p>
      {leadId && (
        <>
          <ScegliDocumento etichetta="Contratto" documenti={documenti} valore={contratto} onCambia={setContratto} link={linkContratto} onLink={setLinkContratto} />
          <ScegliDocumento etichetta="Bozza del lavoro" documenti={documenti} valore={bozza} onCambia={setBozza} link={linkBozza} onLink={setLinkBozza} />
        </>
      )}
      <Selettore etichetta="Lavoro tipo" opzioni={lista.map((m) => ({ valore: m.id, etichetta: m.name, meta: `${m.tasks.length} task` }))} valore={scelto} onCambia={setModello} />
      <CampoGiorno etichetta="Avvio" valore={avvio} onCambia={setAvvio} />
      <Campo etichetta="Canone mensile (euro)" inputMode="decimal" placeholder="300" aiuto={canoneIniziale ? `Atteso dal lead: ${euro(canoneIniziale)} al mese` : undefined} value={canoneTesto} onChange={(e) => setCanone(e.target.value)} />
      {clientId && (cliente.data?.automazioni.length ?? 0) > 0 && (
        <Selettore etichetta="Automazione" segnaposto="Nessuna" opzioni={cliente.data!.automazioni.map((a) => ({ valore: a.id, etichetta: a.name }))} valore={automazione} onCambia={setAutomazione} />
      )}
    </Foglio>
  );
}
