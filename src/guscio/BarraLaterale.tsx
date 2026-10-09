import { CaretDown, GearSix, Plus, SignOut } from "@phosphor-icons/react";
import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { Avatar, Badge, cx } from "../ds";
import { AREE, SOTTOMENU, areaDi, creazioneDellaBarra, type Creazione } from "./aree";
import type { BadgeDati } from "./BarraBasso";
import { Icona3D } from "./Icona3D";

// Computer: logo, pulsante di creazione, aree a gruppi, profilo.
// L'etichetta segue l'area: la prima creazione del suo foglio (Nuovo lead, Nuova automazione, Nuova fattura),
// e il pulsante apre direttamente quel foglio (QA 9); l'elenco completo resta nel "+" della testata.
// È secondario (bordo, nessun fondo accento): l'unica azione in accento è quella della pagina o del foglio (QA 8).
export function BarraLaterale({ nome, badge, onCrea, onEsci }: { nome: string; badge: BadgeDati | undefined; onCrea: (c: Creazione) => void; onEsci: () => void }) {
  const { pathname } = useLocation();
  const corrente = areaDi(pathname);
  const prima = creazioneDellaBarra(pathname);
  const [aperte, setAperte] = useState<Record<string, boolean>>({});
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-chrome-3 bg-chrome text-chrome-testo md:flex">
      <img src="/brand/logo-negativo.svg" alt="Acceleriamo" className="mx-5 mt-6 mb-2 h-6 w-auto self-start" />
      <button type="button" data-variante="secondario" onClick={() => onCrea(prima.id)} className="m-4 flex h-11 items-center justify-center gap-2 rounded-controllo border-[1.5px] border-chrome-testo/60 font-semibold text-chrome-testo transition-[background-color,transform] duration-(--durata-veloce) hover:bg-chrome-2 active:scale-98">
        <Plus size={20} weight="bold" aria-hidden />{prima.etichetta}
      </button>
      <nav aria-label="Aree" className="flex-1 overflow-y-auto px-2">
        {AREE.map((a) => {
          const aperta = aperte[a.id] ?? corrente === a.id;
          const n = a.id === "commerciale" ? badge?.commerciale ?? 0 : a.id === "economia" ? badge?.economia ?? 0 : 0;
          return (
            <div key={a.id} className="mb-1">
              <button type="button" data-area={a.id} aria-expanded={aperta} onClick={() => setAperte({ ...aperte, [a.id]: !aperta })}
                className={cx("flex h-11 w-full items-center gap-3 rounded-controllo px-3 transition-colors duration-(--durata-veloce) hover:bg-chrome-2", corrente === a.id ? "bg-chrome-2 text-chrome-testo" : "text-chrome-testo-2")}>
                <Icona3D area={a.id} attiva={corrente === a.id} misura={24} />
                <span className="flex-1 text-left font-semibold">{a.etichetta}</span>
                <Badge n={n} />
                <CaretDown size={16} weight="bold" aria-hidden className={cx("transition-transform duration-(--durata-base) ease-(--ease-uscita)", aperta && "rotate-180")} />
              </button>
              {aperta && SOTTOMENU[a.id].map((s) => (
                <NavLink key={s.percorso} to={s.percorso} end={s.percorso === "/economia" || s.percorso === "/automazioni"}
                  className={({ isActive }) => cx("ml-9 flex h-10 items-center rounded-controllo px-3 text-secondaria transition-colors duration-(--durata-veloce)", isActive ? "bg-chrome-2 font-medium text-chrome-testo" : "text-chrome-testo-2 hover:bg-chrome-2")}>
                  {s.etichetta}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="flex items-center gap-2 border-t border-chrome-3 p-3">
        <Avatar nome={nome} />
        <span className="flex-1 truncate text-secondaria">{nome}</span>
        <Link to="/impostazioni" aria-label="Impostazioni" className="flex size-10 items-center justify-center rounded-controllo hover:bg-chrome-2"><GearSix size={20} weight="bold" aria-hidden /></Link>
        <button type="button" aria-label="Esci" onClick={onEsci} className="flex size-10 items-center justify-center rounded-controllo hover:bg-chrome-2"><SignOut size={20} weight="bold" aria-hidden /></button>
      </div>
    </aside>
  );
}
