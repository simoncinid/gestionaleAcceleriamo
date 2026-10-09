import { useEffect, useRef, useState, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useBadge } from "../hooks";
import { creazioneDelPiu, creazioniDelPercorso, type Creazione } from "./aree";
import { BarraBasso } from "./BarraBasso";
import { BarraLaterale } from "./BarraLaterale";
import { FoglioCrea } from "./FoglioCrea";
import { leggiScorciatoia } from "./scorciatoie";
import { Testata } from "./Testata";
import { useAzzeraAnonimoFuoriArea } from "../pagine/automazioni/anonimo";

// I fogli di creazione arrivano dalle pagine dei task 10, 14 e 18 tramite `fogli`.
export function Guscio({ nome, onEsci, fogli }: { nome: string; onEsci: () => void; fogli: (crea: Creazione | null, chiudi: () => void) => ReactNode }) {
  useAzzeraAnonimoFuoriArea();
  const { pathname } = useLocation();
  const vai = useNavigate();
  const [crea, setCrea] = useState<Creazione | null>(null);
  const [menu, setMenu] = useState(false);
  const attesa = useRef<string | null>(null);
  const badge = useBadge().data;

  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable], dialog[open]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" && attesa.current === null) return setCrea(creazioneDelPiu(pathname));
      const r = leggiScorciatoia(attesa.current, e.key);
      attesa.current = r.attesa;
      if (r.percorso) vai(r.percorso);
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, [pathname, vai]);

  const chiudi = () => setCrea(null);
  const voci = creazioniDelPercorso(pathname);
  // Con una sola voce (Automazioni) il foglio dell'elenco non serve: si apre subito la creazione.
  const piu = () => (voci.length === 1 ? setCrea(voci[0].id) : setMenu(true));
  return (
    <>
      <div className="flex min-h-dvh bg-crema">
        <BarraLaterale nome={nome} badge={badge} onCrea={setCrea} onEsci={onEsci} />
        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-10">
            <Testata nome={nome} puntoAvatar={badge?.avatar ?? false} avvisi={badge?.avvisi ?? 0} onCerca={() => vai("/commerciale/scaletta?cerca=1")} onPiu={piu} />
          </div>
          <main className="mx-auto w-full max-w-[1100px] px-4 pt-4 md:px-8 md:pt-8"><Outlet /></main>
        </div>
      </div>
      <BarraBasso badge={badge} />
      <FoglioCrea aperto={menu} voci={voci} onChiudi={() => setMenu(false)} onScegli={(c) => { setMenu(false); setCrea(c); }} />
      {fogli(crea, chiudi)}
    </>
  );
}
