import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CaretDown } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../api";
import { Campo, Errore, Foglio, Pulsante, Punto, Selettore, Skeleton, StatoVuoto, cx } from "../../../ds";
import { centesimiDaTesto, euroCentesimi, mesiRecenti, nomeMese } from "../../../format";
import type { Campagne as CampagneDati, LivelloCosto, RigaCampagna } from "../../../types";
import { Sottotitolo, Voce } from "./righe";

const PUNTO: Record<LivelloCosto, "verde" | "giallo" | "rosso" | "grigio"> = { senza_spesa: "grigio", buono: "verde", accettabile: "verde", attenzione: "giallo", stop: "rosso" };
const LIVELLO: Record<LivelloCosto, string> = {
  senza_spesa: "Spesa da scrivere", buono: "Costo buono", accettabile: "Costo accettabile", attenzione: "Costo da tenere d'occhio", stop: "Stop loss superato",
};
const vinti = (n: number) => `${n} ${n === 1 ? "cliente vinto" : "clienti vinti"}`;
// Centesimi nel campo del foglio: "532,40".
const testoImporto = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));

const ALTRA = "__altra__";
const MASSIMO_CENTS = 10_000_000; // lo stesso tetto del server (worker/numeri/routes.ts)

// Il motivo per cui "Salva la spesa" è spento, o undefined se si può salvare.
export function motivoSpesa(campagna: string, importo: string): string | undefined {
  const cents = centesimiDaTesto(importo);
  if (campagna.trim() === "") return "Scegli la campagna";
  if (importo.trim() === "") return "Scrivi l'importo";
  if (cents == null) return "Scrivi un importo in euro, per esempio 532,40";
  if (cents > MASSIMO_CENTS) return "Al massimo € 100.000 al mese";
  return undefined;
}

// Voce 18: la spesa si scrive anche in un mese senza campagne, con il nome scritto a mano ("Un'altra campagna").
export function FoglioSpesa({ mese, campagne, onChiudi }: { mese: string; campagne: RigaCampagna[]; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [scelta, setScelta] = useState(campagne[0]?.campagna ?? ALTRA);
  const [nuova, setNuova] = useState("");
  const [importo, setImporto] = useState(testoImporto(campagne[0]?.spesaCents));
  const campagna = scelta === ALTRA ? nuova.trim() : scelta;
  const salva = useMutation({
    mutationFn: () => api("/campaign-spend", { method: "PUT", json: { campagna, mese, amountCents: centesimiDaTesto(importo) } }),
    onSuccess: () => { toast.success("Spesa salvata"); void qc.invalidateQueries({ queryKey: ["numeri", "campagne"] }); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  const cambiaCampagna = (c: string) => { setScelta(c); setImporto(testoImporto(campagne.find((x) => x.campagna === c)?.spesaCents)); };
  return (
    <Foglio
      aperto
      titolo={`Spesa di ${nomeMese(mese)}`}
      onChiudi={onChiudi}
      principale={<Pulsante variante="primario" inCorso={salva.isPending} motivoSpento={motivoSpesa(campagna, importo)} onClick={() => salva.mutate()}>Salva la spesa</Pulsante>}
    >
      <div className="flex flex-col gap-4">
        {campagne.length > 0 && (
          <Selettore etichetta="Campagna" opzioni={[...campagne.map((c) => ({ valore: c.campagna, etichetta: c.campagna })), { valore: ALTRA, etichetta: "Un'altra campagna" }]} valore={scelta} onCambia={cambiaCampagna} />
        )}
        {scelta === ALTRA && <Campo etichetta="Nome della campagna" autoComplete="off" value={nuova} onChange={(e) => setNuova(e.target.value)} aiuto="Lo stesso nome che usa Meta, così i lead si abbinano" />}
        <Campo etichetta="Spesa in euro" inputMode="decimal" autoComplete="off" value={importo} onChange={(e) => setImporto(e.target.value)} aiuto="Il totale speso nel mese su Meta per questa campagna" />
      </div>
    </Foglio>
  );
}

// Riga chiusa della campagna (voce 17): nome, lead e costo per lead; "Nessuna spesa" senza punto se la spesa è zero (minore 11).
function RigaChiusa({ c, aperta, onTocca, idDettaglio }: { c: RigaCampagna; aperta: boolean; onTocca: () => void; idDettaglio: string }) {
  const costo = c.spesaCents === 0 ? "Nessuna spesa" : c.spesaCents == null ? "Spesa da scrivere" : c.costoPerLeadCents == null ? "Costo per lead n.d." : `Costo per lead ${euroCentesimi(c.costoPerLeadCents)}`;
  const punto = c.spesaCents ? PUNTO[c.livello] : undefined;
  return (
    <button type="button" data-campagna={c.campagna} aria-expanded={aperta} aria-controls={idDettaglio} onClick={onTocca}
      className="flex min-h-14 w-full items-center gap-3 rounded-blocco border border-sabbia bg-avorio px-4 py-3 text-left">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display text-titolo-blocco [overflow-wrap:anywhere]">{c.campagna}</span>
        <span className="text-secondaria text-grigio tabular-nums">{c.lead} lead</span>
        <span className="flex items-center gap-2 text-secondaria text-grigio tabular-nums">{punto && <Punto colore={punto} etichetta={LIVELLO[c.livello]} />}{costo}</span>
      </span>
      <CaretDown size={18} weight="bold" aria-hidden className={cx("shrink-0 motion-safe:transition-transform", aperta && "rotate-180")} />
    </button>
  );
}

function Dettaglio({ c, soglieCents }: { c: RigaCampagna; soglieCents: number[] }) {
  const zero = c.spesaCents === 0;
  return (
    <ul className="flex flex-col divide-y divide-sabbia rounded-blocco border border-sabbia bg-avorio">
      {c.livello === "stop" && <Voce nome="Stop loss superato" numero="" dettaglio={`Il costo per lead supera ${euroCentesimi(soglieCents[2])}`} punto="rosso" etichettaPunto="Avviso" />}
      <Voce nome="Lead arrivati" numero={c.lead} />
      <Voce nome="Qualificati" numero={c.qualificati} dettaglio="Arrivati alla call di conoscenza" />
      <Voce nome="Call fatte" numero={c.call} />
      <Voce nome="Proposte presentate" numero={c.proposte} />
      <Voce nome="Clienti vinti" numero={c.vinti} />
      <Voce nome="Setup vinto" numero={euroCentesimi(c.setupVintoCents)} />
      <Voce nome="Spesa del mese" numero={c.spesaCents == null ? "da scrivere" : zero ? "nessuna spesa" : euroCentesimi(c.spesaCents)} />
      <Voce
        nome="Costo per lead"
        numero={c.costoPerLeadCents == null ? "n.d." : euroCentesimi(c.costoPerLeadCents)}
        punto={zero ? undefined : PUNTO[c.livello]}
        etichettaPunto={LIVELLO[c.livello]}
        dettaglio={`Soglie ${soglieCents.map((s) => euroCentesimi(s)).join(", ")}`}
      />
      <Voce nome="Costo per cliente" numero={c.costoPerClienteCents == null ? "n.d." : euroCentesimi(c.costoPerClienteCents)} />
      {c.inserzioni.length > 0 && <Sottotitolo>Per inserzione</Sottotitolo>}
      {c.inserzioni.map((i) => <Voce key={i.inserzione} nome={i.inserzione} numero={`${i.lead} lead`} dettaglio={vinti(i.vinti)} />)}
    </ul>
  );
}

export function Campagne({ ora = Date.now() }: { ora?: number }) {
  const mesi = mesiRecenti(ora, 6);
  const [mese, setMese] = useState(mesi[0].valore);
  const [spesaAperta, setSpesaAperta] = useState(false);
  const [toccate, setToccate] = useState<Record<string, boolean>>({});
  const idBase = useId();
  const q = useQuery({ queryKey: ["numeri", "campagne", mese], queryFn: () => api<CampagneDati>(`/numeri/campagne?mese=${mese}`) });
  const d = q.data;
  // Con una sola campagna il dettaglio è già aperto; con più campagne le righe partono chiuse.
  const aperta = (c: string) => toccate[c] ?? d?.campagne.length === 1;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Selettore etichetta="Mese" opzioni={mesi} valore={mese} onCambia={(m) => { setMese(m); setToccate({}); }} />
        {d && <div><Pulsante variante="secondario" onClick={() => setSpesaAperta(true)}>Scrivi la spesa del mese</Pulsante></div>}
      </div>
      {q.isLoading ? <Skeleton righe={6} /> : q.error || !d ? <Errore errore={q.error} onRiprova={() => void q.refetch()} /> : d.campagne.length === 0 ? (
        <StatoVuoto titolo="Nessun lead da campagne nel mese" testo="I lead arrivano da Meta e dal foglio di Andrea con il nome della campagna." />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {d.campagne.map((c, i) => (
              <section key={c.campagna} className="flex flex-col gap-2">
                <RigaChiusa c={c} aperta={aperta(c.campagna)} idDettaglio={`${idBase}-${i}`} onTocca={() => setToccate((t) => ({ ...t, [c.campagna]: !aperta(c.campagna) }))} />
                <div id={`${idBase}-${i}`} hidden={!aperta(c.campagna)}>{aperta(c.campagna) && <Dettaglio c={c} soglieCents={d.soglieCents} />}</div>
              </section>
            ))}
          </div>
          <p className="text-meta text-grigio">I lead doppi tra Meta e foglio si contano una volta. La spesa si scrive a mano finché Meta non verifica l'azienda.</p>
        </>
      )}
      {spesaAperta && d && <FoglioSpesa mese={mese} campagne={d.campagne} onChiudi={() => setSpesaAperta(false)} />}
    </div>
  );
}
