import { DotsThree } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Contatto, Pulsante } from "../../ds";
import { useModelli } from "../../hooks";
import type { LeadListItem } from "../../types";
import { avviaContatto } from "./chiamata";
import { compila, modelloPer } from "./modelli";

const TOCCO_LUNGO = 500;

// Voce 42: tutte le voci allineate a sinistra, contatti compresi.
// Voci del menu: montate solo quando il menu è aperto, così i modelli si leggono solo quando servono.
export function Voci({ lead, chiudi, onEsito, onSposta }: { lead: LeadListItem; chiudi: () => void; onEsito: () => void; onSposta: () => void }) {
  const wa = modelloPer(useModelli().data, "whatsapp", lead.stageId, "non_ti_ho_trovato");
  return (
    <div role="group" aria-label={`Azioni rapide su ${lead.company}`}
      className="absolute right-2 top-14 z-10 grid w-56 gap-1 rounded-blocco border border-sabbia bg-avorio p-2 shadow-galleggiante">
      <Contatto tipo="chiama" lead={lead} variante="fantasma" className="justify-start" onAvvio={() => { avviaContatto(lead.id, "chiamata"); chiudi(); }} />
      <Contatto tipo="whatsapp" lead={lead} variante="fantasma" className="justify-start" testo={compila(wa?.body, lead)} onAvvio={() => { avviaContatto(lead.id, "whatsapp", wa?.id); chiudi(); }} />
      <Pulsante variante="fantasma" className="justify-start" onClick={() => { chiudi(); onEsito(); }}>Segna esito</Pulsante>
      <Pulsante variante="fantasma" className="justify-start" onClick={() => { chiudi(); onSposta(); }}>Sposta in fase</Pulsante>
    </div>
  );
}

// Spec 6.5: tocco lungo sulla card (telefono) o DotsThree (computer). PV6: gli ascoltatori avvolgono la CardLead.
export function MenuRapido({ lead, onEsito, onSposta, children }: { lead: LeadListItem; onEsito: () => void; onSposta: () => void; children: ReactNode }) {
  const [aperto, setAperto] = useState(false);
  const timer = useRef<number | null>(null);
  const lungo = useRef(false);
  const radice = useRef<HTMLLIElement>(null);
  const ferma = () => {
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = null;
  };

  // Tocco fuori o Esc chiudono il menu.
  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: PointerEvent) => { if (!radice.current?.contains(e.target as Node)) setAperto(false); };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAperto(false);
      // Il fuoco torna sul pulsante che apre il menu.
      radice.current?.querySelector<HTMLButtonElement>("[data-apri-menu]")?.focus();
    };
    document.addEventListener("pointerdown", fuori);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fuori); document.removeEventListener("keydown", esc); };
  }, [aperto]);
  useEffect(() => ferma, []);

  return (
    <li ref={radice} data-menu-rapido={lead.id} className="relative select-none [-webkit-touch-callout:none]"
      onPointerDown={(e) => {
        lungo.current = false;
        if (e.pointerType === "mouse") return;
        timer.current = window.setTimeout(() => { lungo.current = true; setAperto(true); }, TOCCO_LUNGO);
      }}
      onPointerUp={ferma} onPointerLeave={ferma} onPointerCancel={ferma}
      onContextMenu={(e) => { if (lungo.current || timer.current != null) e.preventDefault(); }}
      // Dopo un tocco lungo il rilascio non deve aprire la scheda del lead.
      onClickCapture={(e) => { if (lungo.current) { e.preventDefault(); e.stopPropagation(); lungo.current = false; } }}>
      {children}
      <Pulsante data-apri-menu variante="fantasma" aria-label={`Azioni rapide su ${lead.company}`} aria-expanded={aperto} onClick={() => setAperto((a) => !a)}
        icona={<DotsThree size={22} weight="bold" aria-hidden />} className="absolute right-2 top-2 hidden w-11 px-0! md:inline-flex" />
      {aperto && <Voci lead={lead} chiudi={() => setAperto(false)} onEsito={onEsito} onSposta={onSposta} />}
    </li>
  );
}
