import { FunnelSimple, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useState } from "react";
import { Foglio, Pulsante, Selettore, SelettoreMultiplo, cx } from "../../ds";
import type { Stage } from "../../types";
import { EtichettaFase } from "./EtichettaFase";
import { Filtro } from "./Tendina";
import { COLONNE_EXTRA, FILTRI_BASE, NESSUNO, SEGMENTI, fasiDelSegmento, quantiFiltri, type ColonnaExtra, type Filtri, type Segmento } from "./tabellaLead";

type Persona = { id: string; name: string };
type Props = { filtri: Filtri; onCambia: (f: Filtri) => void; fasi: Stage[]; utenti: Persona[]; campagne: string[]; senzaResponsabile: boolean; conta: (f: Filtri) => number };

// Segmento a tre voci: un solo gruppo con bordo, la voce attiva piena. Sul telefono prende tutta la riga.
export function Segmenti({ valore, onCambia }: { valore: Segmento; onCambia: (s: Segmento) => void }) {
  return (
    <div role="group" aria-label="Quali lead" className="flex shrink-0 rounded-controllo border-[1.5px] border-sabbia-2 bg-avorio p-0.5 md:h-11">
      {SEGMENTI.map((s) => (
        <button key={s.id} type="button" aria-pressed={valore === s.id} onClick={() => onCambia(s.id)}
          className={cx("h-11 min-w-0 flex-1 rounded-[9px] px-4 md:h-auto text-secondaria font-medium transition-colors duration-(--durata-veloce) md:flex-none",
            valore === s.id ? "bg-ink text-avorio" : "text-ink hover:bg-crema")}>
          {s.etichetta}
        </button>
      ))}
    </div>
  );
}


function opzioniResponsabile(utenti: Persona[], senzaResponsabile: boolean) {
  return [...utenti.map((u) => ({ valore: u.id, etichetta: u.name })), ...(senzaResponsabile ? [{ valore: NESSUNO, etichetta: "Nessuno" }] : [])];
}

export function Ricerca({ valore, onCambia, className }: { valore: string; onCambia: (q: string) => void; className?: string }) {
  return (
    <label className={cx("flex h-11 min-w-0 items-center gap-2 rounded-controllo border-[1.5px] border-sabbia-2 bg-avorio px-3 focus-within:border-ink", className)}>
      <MagnifyingGlass size={18} weight="bold" aria-hidden className="shrink-0 text-grigio" />
      <input type="search" value={valore} onChange={(e) => onCambia(e.target.value)} placeholder="Cerca nome, telefono o email" aria-label="Cerca nei lead"
        onKeyDown={(e) => { if (e.key === "Escape" && valore) { e.preventDefault(); onCambia(""); } }}
        className="h-full min-w-0 flex-1 bg-transparent text-secondaria outline-none placeholder:text-grigio [&::-webkit-search-cancel-button]:hidden" />
      {valore && (
        <button type="button" aria-label="Cancella la ricerca" onClick={() => onCambia("")} className="-mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] text-grigio hover:bg-crema hover:text-ink">
          <X size={16} weight="bold" aria-hidden />
        </button>
      )}
    </label>
  );
}

// Riga dei filtri del computer (contratto, sezione 4): segmento, Fase a più scelte, Responsabile, Campagna, ricerca, Colonne.
export function FiltriComputer({ filtri, onCambia, fasi, utenti, campagne, senzaResponsabile }: Props) {
  const cambia = (p: Partial<Filtri>) => onCambia({ ...filtri, ...p });
  return (
    <div className="hidden flex-wrap items-center gap-2 md:flex">
      <Segmenti valore={filtri.seg} onCambia={(seg) => cambia({ seg, fasi: [] })} />
      <Filtro etichetta="Fase" multipla valori={filtri.fasi} onCambia={(fasi) => cambia({ fasi })} larghezza={280}
        opzioni={fasiDelSegmento(fasi, filtri.seg).map((f) => ({ valore: f.id, etichetta: f.label, voce: <EtichettaFase label={f.label} tone={f.tone} /> }))} />
      <Filtro etichetta="Responsabile" tutte="Tutti" valori={filtri.resp ? [filtri.resp] : []} onCambia={([r]) => cambia({ resp: r ?? "" })}
        opzioni={opzioniResponsabile(utenti, senzaResponsabile)} />
      {campagne.length > 0 && (
        <Filtro etichetta="Campagna" valori={filtri.camp ? [filtri.camp] : []} onCambia={([c]) => cambia({ camp: c ?? "" })} larghezza={300}
          opzioni={campagne.map((c) => ({ valore: c, etichetta: c }))} />
      )}
      {/* "Entro oggi" arriva da Oggi: si vede solo quando è acceso e si toglie da qui. */}
      {filtri.scad && (
        <Filtro etichetta="Scadenza" valori={["oggi"]} onCambia={([s]) => cambia({ scad: s === "oggi" ? "oggi" : "" })} opzioni={[{ valore: "oggi", etichetta: "Entro oggi" }]} />
      )}
      <Ricerca valore={filtri.q} onCambia={(q) => cambia({ q })} className="min-w-[200px] flex-1" />
      <Filtro<ColonnaExtra> etichetta="Colonne" tutte="Solo le principali" chiuso="" multipla valori={filtri.col} onCambia={(col) => cambia({ col })}
        opzioni={COLONNE_EXTRA.map((c) => ({ valore: c.id, etichetta: c.etichetta }))} />
    </div>
  );
}

// Telefono: segmento a tutta riga, sotto ricerca e "Filtri" con il numero dei filtri accesi; i selettori stanno nel foglio.
export function FiltriTelefono(p: Props) {
  const { filtri, onCambia } = p;
  const [aperto, setAperto] = useState(false);
  const n = quantiFiltri(filtri);
  return (
    <div className="flex flex-col gap-2 md:hidden">
      <Segmenti valore={filtri.seg} onCambia={(seg) => onCambia({ ...filtri, seg, fasi: [] })} />
      <div className="flex gap-2">
        <Ricerca valore={filtri.q} onCambia={(q) => onCambia({ ...filtri, q })} className="flex-1" />
        <Pulsante variante={n ? "secondario" : "fantasma"} className={cx("shrink-0 px-3!", !n && "border-[1.5px] border-sabbia-2")} onClick={() => setAperto(true)}
          aria-label={n ? `Filtri, ${n} ${n === 1 ? "attivo" : "attivi"}` : "Filtri"} icona={<FunnelSimple size={18} weight="bold" aria-hidden />}>
          Filtri{n > 0 && <span className="tabular-nums">{n}</span>}
        </Pulsante>
      </div>
      {aperto && <FoglioFiltriLead {...p} onChiudi={() => setAperto(false)} />}
    </div>
  );
}

// Le scelte valgono solo con "Mostra N lead": Annulla lascia i filtri com'erano.
function FoglioFiltriLead({ filtri: iniziali, onCambia, fasi, utenti, campagne, senzaResponsabile, conta, onChiudi }: Props & { onChiudi: () => void }) {
  const [filtri, setFiltri] = useState(iniziali);
  const cambia = (x: Partial<Filtri>) => setFiltri((f) => ({ ...f, ...x }));
  const risultati = conta(filtri);
  const opzioniFase = fasiDelSegmento(fasi, filtri.seg).map((f) => ({ valore: f.id, etichetta: f.label }));
  const n = quantiFiltri(filtri);
  return (
    <Foglio aperto titolo="Filtri" onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" onClick={() => { onCambia(filtri); onChiudi(); }}>{`Mostra ${risultati} lead`}</Pulsante>}>
      <div className="flex flex-col gap-3">
        <SelettoreMultiplo etichetta="Fase" opzioni={opzioniFase} valori={filtri.fasi} onCambia={(f) => cambia({ fasi: f })} segnaposto="Tutte" />
        <Selettore etichetta="Responsabile" opzioni={[{ valore: "", etichetta: "Tutti" }, ...opzioniResponsabile(utenti, senzaResponsabile)]}
          valore={filtri.resp} onCambia={(resp) => cambia({ resp })} />
        {campagne.length > 0 && (
          <Selettore etichetta="Campagna" opzioni={[{ valore: "", etichetta: "Tutte" }, ...campagne.map((c) => ({ valore: c, etichetta: c }))]}
            valore={filtri.camp} onCambia={(camp) => cambia({ camp })} />
        )}
        <Selettore etichetta="Scadenza" opzioni={[{ valore: "", etichetta: "Tutte" }, { valore: "oggi", etichetta: "Entro oggi" }]}
          valore={filtri.scad} onCambia={(scad) => cambia({ scad: scad === "oggi" ? "oggi" : "" })} />
        {n > 0 && (
          <Pulsante variante="fantasma" className="self-start" onClick={() => setFiltri({ ...FILTRI_BASE, seg: filtri.seg, q: filtri.q, ord: filtri.ord, dir: filtri.dir, col: filtri.col })}>
            Togli i filtri
          </Pulsante>
        )}
      </div>
    </Foglio>
  );
}
