import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { Link, useLocation } from "react-router";
import { Avatar, Punto, cx } from "../ds";
import { AREE, SOTTOMENU, areaDi } from "./aree";

// Telefono: testata scura con titolo dell'area, lente, "+" e avatar; sotto, le schede del sottomenu.
// Il "+" è un pulsante icona del chrome, non un primario della pagina: niente data-variante.
export function Testata({ nome, puntoAvatar, onCerca, onPiu }: { nome: string; puntoAvatar: boolean; onCerca: () => void; onPiu: () => void }) {
  const { pathname } = useLocation();
  const area = areaDi(pathname);
  const titolo = area ? AREE.find((a) => a.id === area)!.etichetta : "Impostazioni";
  // Sottomenu come schede di navigazione (non chip: le chip restano per tag e segmenti da 2-3 voci).
  const attivo = (p: string) => pathname === p || (p !== "/economia" && p !== "/automazioni" && pathname.startsWith(p));
  const tocco = "transition-transform duration-(--durata-veloce) ease-(--ease-uscita) active:scale-96";
  return (
    <div className="md:hidden">
      <header className="flex h-14 items-center justify-between border-b border-chrome-3 bg-chrome pr-2 pl-4 text-chrome-testo">
        <p className="font-display text-titolo-card">{titolo}</p>
        <div className="flex items-center">
          <button type="button" aria-label="Cerca" onClick={onCerca} className={cx("flex size-11 items-center justify-center rounded-controllo", tocco)}>
            <MagnifyingGlass size={22} weight="bold" aria-hidden />
          </button>
          <button type="button" aria-label={`Crea in ${area ? titolo : "Commerciale"}`} onClick={onPiu} className={cx("flex size-11 items-center justify-center", tocco)}>
            <span className="flex size-9 items-center justify-center rounded-full bg-accento text-accento-inchiostro"><Plus size={20} weight="bold" aria-hidden /></span>
          </button>
          <Link to="/impostazioni" aria-label="Profilo e impostazioni" className={cx("relative flex size-11 items-center justify-center", tocco)}>
            <Avatar nome={nome} />
            {puntoAvatar && <span className="absolute top-1 right-1"><Punto colore="accento" etichetta="Un'integrazione chiede attenzione" /></span>}
          </Link>
        </div>
      </header>
      {area && (
        <nav aria-label="Sottomenu" className="flex gap-4 overflow-x-auto border-b border-sabbia bg-avorio px-4 [scrollbar-width:none]">
          {SOTTOMENU[area].map((s) => (
            <Link key={s.percorso} to={s.percorso} aria-current={attivo(s.percorso) ? "page" : undefined}
              className={cx("flex h-11 shrink-0 items-center border-b-2 px-1 text-secondaria font-medium transition-colors duration-(--durata-veloce)", attivo(s.percorso) ? "border-ink text-ink" : "border-transparent text-grigio")}>
              {s.etichetta}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
