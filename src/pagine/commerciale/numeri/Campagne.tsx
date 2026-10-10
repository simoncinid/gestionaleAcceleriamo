import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../api";
import { Campo, Errore, Foglio, Pulsante, Selettore, Skeleton, StatoVuoto } from "../../../ds";
import { centesimiDaTesto, euroCentesimi, mesiRecenti, nomeMese } from "../../../format";
import type { Campagne as CampagneDati, LivelloCosto, RigaCampagna } from "../../../types";
import { Gruppo, Sottotitolo, Voce } from "./righe";

const PUNTO: Record<LivelloCosto, "verde" | "giallo" | "rosso" | "grigio"> = { senza_spesa: "grigio", buono: "verde", accettabile: "verde", attenzione: "giallo", stop: "rosso" };
const LIVELLO: Record<LivelloCosto, string> = {
  senza_spesa: "Spesa da scrivere", buono: "Costo buono", accettabile: "Costo accettabile", attenzione: "Costo da tenere d'occhio", stop: "Stop loss superato",
};
const vinti = (n: number) => `${n} ${n === 1 ? "cliente vinto" : "clienti vinti"}`;
// Centesimi nel campo del foglio: "532,40".
const testoImporto = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));

export function FoglioSpesa({ mese, campagne, onChiudi }: { mese: string; campagne: RigaCampagna[]; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [campagna, setCampagna] = useState(campagne[0]?.campagna ?? "");
  const [importo, setImporto] = useState(testoImporto(campagne[0]?.spesaCents));
  const cents = centesimiDaTesto(importo);
  const salva = useMutation({
    mutationFn: () => api("/campaign-spend", { method: "PUT", json: { campagna, mese, amountCents: cents } }),
    onSuccess: () => { toast.success("Spesa salvata"); void qc.invalidateQueries({ queryKey: ["numeri", "campagne"] }); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  const cambiaCampagna = (c: string) => { setCampagna(c); setImporto(testoImporto(campagne.find((x) => x.campagna === c)?.spesaCents)); };
  const motivo = campagna === "" ? "Scegli la campagna" : importo.trim() === "" ? "Scrivi l'importo" : cents == null ? "Scrivi un importo in euro, per esempio 532,40" : undefined;
  return (
    <Foglio
      aperto
      titolo={`Spesa di ${nomeMese(mese)}`}
      onChiudi={onChiudi}
      principale={<Pulsante variante="primario" inCorso={salva.isPending} motivoSpento={motivo} onClick={() => salva.mutate()}>Salva la spesa</Pulsante>}
    >
      <div className="flex flex-col gap-4">
        <Selettore etichetta="Campagna" opzioni={campagne.map((c) => ({ valore: c.campagna, etichetta: c.campagna }))} valore={campagna} onCambia={cambiaCampagna} />
        <Campo etichetta="Spesa in euro" inputMode="decimal" autoComplete="off" value={importo} onChange={(e) => setImporto(e.target.value)} aiuto="Il totale speso nel mese su Meta per questa campagna" />
      </div>
    </Foglio>
  );
}

export function Campagne({ ora = Date.now() }: { ora?: number }) {
  const mesi = mesiRecenti(ora, 6);
  const [mese, setMese] = useState(mesi[0].valore);
  const [spesaAperta, setSpesaAperta] = useState(false);
  const q = useQuery({ queryKey: ["numeri", "campagne", mese], queryFn: () => api<CampagneDati>(`/numeri/campagne?mese=${mese}`) });
  const d = q.data;
  return (
    <div className="flex flex-col gap-6">
      <Selettore etichetta="Mese" opzioni={mesi} valore={mese} onCambia={setMese} />
      {q.isLoading ? <Skeleton righe={6} /> : q.error || !d ? <Errore errore={q.error} onRiprova={() => void q.refetch()} /> : d.campagne.length === 0 ? (
        <StatoVuoto titolo="Nessun lead da campagne nel mese" testo="I lead arrivano da Meta e dal foglio di Andrea con il nome della campagna." />
      ) : (
        <>
          {d.campagne.map((c) => (
            <Gruppo key={c.campagna} titolo={c.campagna}>
              {c.livello === "stop" && <Voce nome="Stop loss superato" numero="" dettaglio={`Il costo per lead supera ${euroCentesimi(d.soglieCents[2])}`} punto="rosso" etichettaPunto="Avviso" />}
              <Voce nome="Lead arrivati" numero={c.lead} />
              <Voce nome="Qualificati" numero={c.qualificati} dettaglio="Arrivati alla call di conoscenza" />
              <Voce nome="Call fatte" numero={c.call} />
              <Voce nome="Proposte presentate" numero={c.proposte} />
              <Voce nome="Clienti vinti" numero={c.vinti} />
              <Voce nome="Setup vinto" numero={euroCentesimi(c.setupVintoCents)} />
              <Voce nome="Spesa del mese" numero={c.spesaCents == null ? "da scrivere" : euroCentesimi(c.spesaCents)} />
              <Voce
                nome="Costo per lead"
                numero={c.costoPerLeadCents == null ? "n.d." : euroCentesimi(c.costoPerLeadCents)}
                punto={PUNTO[c.livello]}
                etichettaPunto={LIVELLO[c.livello]}
                dettaglio={`Soglie ${d.soglieCents.map((s) => euroCentesimi(s)).join(", ")}`}
              />
              <Voce nome="Costo per cliente" numero={c.costoPerClienteCents == null ? "n.d." : euroCentesimi(c.costoPerClienteCents)} />
              {c.inserzioni.length > 0 && <Sottotitolo>Per inserzione</Sottotitolo>}
              {c.inserzioni.map((i) => <Voce key={i.inserzione} nome={i.inserzione} numero={`${i.lead} lead`} dettaglio={vinti(i.vinti)} />)}
            </Gruppo>
          ))}
          <div><Pulsante variante="secondario" onClick={() => setSpesaAperta(true)}>Scrivi la spesa del mese</Pulsante></div>
          <p className="text-meta text-grigio">I lead doppi tra Meta e foglio si contano una volta. La spesa si scrive a mano finché Meta non verifica l'azienda.</p>
          {spesaAperta && <FoglioSpesa mese={mese} campagne={d.campagne} onChiudi={() => setSpesaAperta(false)} />}
        </>
      )}
    </div>
  );
}
