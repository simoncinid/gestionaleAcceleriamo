import { useEffect, useRef, useState } from "react";
import { Foglio, Pulsante, Selettore, type Opzione } from "../../ds";
import { MAX_SELEZIONE } from "./filtriScaletta";

// Un invio alla volta: un secondo tocco mentre il primo è in corso non parte (fix dopo revisione del 14b, punto 2).
export function guardiaInvio() {
  let partito = false;
  return {
    prova(f: () => void): boolean {
      if (partito) return false;
      partito = true;
      f();
      return true;
    },
    libera() { partito = false; },
  };
}

// Barra delle azioni in blocco (voce 44): responsabile scelto e poi confermato, cestino col secondo tocco.
// La Scaletta la rimonta a ogni cambio di selezione (key), così nessuna conferma resta in sospeso.
export function BarraSelezione({ n, utenti, inCorso, onAssegna, onSposta, onCestino, responsabileIniziale = null, chiedeCestinoIniziale = false }: {
  n: number; utenti: { id: string; name: string }[]; inCorso: "responsabile" | "cestino" | null;
  onAssegna: (id: string) => void; onSposta: () => void; onCestino: () => void;
  responsabileIniziale?: string | null; chiedeCestinoIniziale?: boolean;
}) {
  const [responsabile, setResponsabile] = useState<string | null>(responsabileIniziale);
  const [chiedeCestino, setChiedeCestino] = useState(chiedeCestinoIniziale);
  const nome = utenti.find((u) => u.id === responsabile)?.name ?? "chi hai scelto";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-blocco border border-sabbia bg-tinta p-3" role="toolbar" aria-label="Azioni sulla selezione">
      <span className="text-secondaria font-semibold tabular-nums">{n === 1 ? "1 selezionato" : `${n} selezionati`}</span>
      {n >= MAX_SELEZIONE && <span className="text-meta text-grigio">Al massimo {MAX_SELEZIONE} per volta</span>}
      <div className="min-w-64">
        <Selettore etichetta="Responsabile" segnaposto="Cambia" valore={responsabile} onCambia={setResponsabile}
          opzioni={utenti.map((u) => ({ valore: u.id, etichetta: u.name }))} />
      </div>
      {responsabile && (
        <>
          <Pulsante variante="secondario" inCorso={inCorso === "responsabile"} onClick={() => onAssegna(responsabile)}>{`Assegna ${n} a ${nome}`}</Pulsante>
          <Pulsante variante="fantasma" onClick={() => setResponsabile(null)}>Annulla</Pulsante>
        </>
      )}
      <Pulsante variante="secondario" onClick={onSposta}>Sposta in fase</Pulsante>
      <Pulsante variante={chiedeCestino ? "distruttivo" : "secondario"} inCorso={inCorso === "cestino"} onBlur={() => setChiedeCestino(false)}
        onClick={() => (chiedeCestino ? onCestino() : setChiedeCestino(true))}>
        {chiedeCestino ? `Tocca di nuovo: ${n} nel cestino` : "Metti nel cestino"}
      </Pulsante>
    </div>
  );
}

// Foglio "Sposta in fase". Un lead solo dal menu rapido: si sposta al tocco della fase (addendum, voce 44), senza primario.
// Più lead: la fase scelta si conferma col primario. Il foglio si monta a ogni apertura e si smonta dopo il
// salvataggio, quindi la fase scelta riparte sempre vuota (fix dopo revisione, punto 1).
export function FoglioSposta({ ids, singolo, opzioni, inCorso, onSposta, onChiudi, faseIniziale = null }: {
  ids: string[]; singolo: boolean; opzioni: Opzione<string>[]; inCorso: boolean;
  onSposta: (fase: string) => void; onChiudi: () => void; faseIniziale?: string | null;
}) {
  const [fase, setFase] = useState<string | null>(singolo ? null : faseIniziale);
  const guardia = useRef(guardiaInvio()).current;
  // Finito un invio (riuscito o no) si può riprovare.
  useEffect(() => { if (!inCorso) guardia.libera(); }, [inCorso, guardia]);
  const etichetta = opzioni.find((o) => o.valore === fase)?.etichetta;
  const principale = singolo ? undefined : (
    <Pulsante variante="primario" misura="lg" className="w-full" motivoSpento={fase ? undefined : "Scegli la fase"} inCorso={inCorso}
      onClick={() => fase && guardia.prova(() => onSposta(fase))}>
      {etichetta ? `Sposta in ${etichetta}` : "Sposta"}
    </Pulsante>
  );
  return (
    <Foglio aperto titolo={singolo ? "Sposta in fase" : `Sposta ${ids.length} lead`} onChiudi={onChiudi} principale={principale}>
      <div className="flex flex-col gap-3">
        <Selettore etichetta="Fase" apertoAllInizio valore={fase} opzioni={opzioni}
          onCambia={(v) => { setFase(v); if (singolo) guardia.prova(() => onSposta(v)); }} />
        <p className="text-meta text-grigio">Chiuso, le fasi perse e quelle con una call si scelgono dalla scheda del lead: chiedono il motivo, i dati del vinto o la data della call.</p>
      </div>
    </Foglio>
  );
}
