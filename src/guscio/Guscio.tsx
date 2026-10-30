import { useEffect, useRef, useState, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useBadge } from "../hooks";
import { creazioneDelPiu, creazioniDelPercorso, type Creazione } from "./aree";
import { BannerDemo } from "./BannerDemo";
import { BarraBasso } from "./BarraBasso";
import { BarraLaterale } from "./BarraLaterale";
import { FoglioCerca } from "./FoglioCerca";
import { FoglioCrea } from "./FoglioCrea";
import { leggiScorciatoia, scorciatoiaRicerca } from "./scorciatoie";
import { scorciatoiaBarra, useBarraRidotta } from "./barraRidotta";
import { Testata } from "./Testata";
import { useAzzeraAnonimoFuoriArea } from "../pagine/automazioni/anonimo";

// I fogli di creazione arrivano dalle pagine dei task 10, 14 e 18 tramite `fogli`.
export function Guscio({ nome, onEsci, fogli }: { nome: string; onEsci: () => void; fogli: (crea: Creazione | null, chiudi: () => void) => ReactNode }) {
  useAzzeraAnonimoFuoriArea();
  const { pathname } = useLocation();
  const schedaLead = /^\/commerciale\/lead\/[^/]+$/.test(pathname);
  const vai = useNavigate();
  const [crea, setCrea] = useState<Creazione | null>(null);
  const [menu, setMenu] = useState(false);
  const [cerca, setCerca] = useState(false);
  const attesa = useRef<string | null>(null);
  const ridottaRef = useRef(false);
  const badge = useBadge().data;
  const [ridotta, setRidotta] = useBarraRidotta();
  const [animata, setAnimata] = useState(true);
  const riduci = (v: boolean) => { setAnimata(true); setRidotta(v); };

  ridottaRef.current = ridotta;
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // Cmd K o Ctrl K aprono la ricerca anche da dentro un campo, mai sopra un altro foglio (voce 65).
      const k = scorciatoiaRicerca(e, document.querySelector("dialog[open]") != null);
      if (k !== "no") { e.preventDefault(); if (k === "si") setCerca(true); return; }
      // Cmd B o Ctrl B: barra laterale ridotta o aperta. Solo sul computer (sul telefono la barra non c'è),
      // mai sopra un foglio aperto né dentro un testo con formattazione. Da tastiera niente animazione.
      if (scorciatoiaBarra(e)) {
        if (document.querySelector("dialog[open]") || t.closest("[contenteditable]") || !window.matchMedia("(min-width: 48rem)").matches) return;
        e.preventDefault(); setAnimata(false); setRidotta(!ridottaRef.current); return;
      }
      if (t.closest("input, textarea, select, [contenteditable], dialog[open]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); return setCerca(true); }
      if (e.key === "n" && attesa.current === null) return setCrea(creazioneDelPiu(pathname));
      const r = leggiScorciatoia(attesa.current, e.key);
      attesa.current = r.attesa;
      if (r.percorso) vai(r.percorso);
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, [pathname, vai, setRidotta]);

  const chiudi = () => setCrea(null);
  const voci = creazioniDelPercorso(pathname);
  // Con una sola voce (Automazioni) il foglio dell'elenco non serve: si apre subito la creazione.
  const piu = () => (voci.length === 1 ? setCrea(voci[0].id) : setMenu(true));
  return (
    <>
      <div className={schedaLead ? "lead-shell flex h-dvh overflow-hidden bg-crema" : "flex min-h-dvh bg-crema"}>
        <BarraLaterale nome={nome} badge={badge} onCrea={setCrea} onEsci={onEsci} onCerca={() => setCerca(true)} ridotta={ridotta} onRiduci={riduci} animata={animata} />
        <div className={schedaLead ? "flex min-h-0 min-w-0 flex-1 flex-col" : "min-w-0 flex-1"}>
          <div className="sticky top-0 z-10">
            <BannerDemo />
            <Testata nome={nome} puntoAvatar={badge?.avatar ?? false} avvisi={badge?.avvisi ?? 0} onCerca={() => setCerca(true)} onPiu={piu} />
          </div>
          {/* Tutta la larghezza a destra della barra laterale. Le pagine si impaginano sulla larghezza del contenitore
              (varianti @5xl, @7xl di Tailwind), non su quella della finestra: la barra laterale non conta. */}
          <main className={schedaLead ? "@container lead-main min-h-0 w-full flex-1 px-3 pt-3 md:px-6 md:pt-4" : "@container w-full px-4 pt-4 md:px-8 md:pt-8"}><Outlet /></main>
        </div>
      </div>
      <BarraBasso badge={badge} />
      <FoglioCrea aperto={menu} voci={voci} onChiudi={() => setMenu(false)} onScegli={(c) => { setMenu(false); setCrea(c); }} />
      <FoglioCerca aperto={cerca} onChiudi={() => setCerca(false)} onCrea={(c) => { setCerca(false); setCrea(c); }} />
      {fogli(crea, chiudi)}
    </>
  );
}
