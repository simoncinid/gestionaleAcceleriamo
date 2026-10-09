import { Link, useLocation } from "react-router";
import { Badge, cx } from "../ds";
import { AREE, areaDi } from "./aree";
import { Icona3D } from "./Icona3D";

export type BadgeDati = { commerciale: number; economia: number; avatar: boolean };

// Telefono: solo le tre aree. Il "+" sta nella testata (decisione di Tommaso, 10/10/2026).
export function BarraBasso({ badge }: { badge: BadgeDati | undefined }) {
  const { pathname } = useLocation();
  const attiva = areaDi(pathname);
  return (
    <nav aria-label="Aree" className="fixed inset-x-0 bottom-0 z-20 grid h-[calc(var(--barra-altezza)+var(--safe-bottom))] grid-cols-3 border-t border-chrome-3 bg-chrome px-3 pb-(--safe-bottom) text-chrome-testo shadow-barra md:hidden">
      {AREE.map((a) => {
        const n = a.id === "commerciale" ? badge?.commerciale ?? 0 : a.id === "economia" ? badge?.economia ?? 0 : 0;
        const on = attiva === a.id;
        return (
          <Link key={a.id} to={a.percorso} data-voce={a.id} aria-current={on ? "page" : undefined}
            className={cx("group relative flex flex-col items-center justify-center gap-0.5 text-etichetta transition-colors duration-(--durata-veloce)", on ? "text-chrome-testo" : "text-chrome-testo-2")}>
            <span className="transition-transform duration-(--durata-veloce) ease-(--ease-uscita) group-active:scale-94"><Icona3D area={a.id} attiva={on} /></span>
            <span>{a.etichetta}</span>
            <span className="absolute top-1 left-1/2 ml-1.5"><Badge n={n} /></span>
            {on && <span className="absolute bottom-0.5 left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-accento" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );
}
