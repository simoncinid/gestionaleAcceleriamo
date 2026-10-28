import { CaretDoubleLeft, CaretDoubleRight, CaretDown, GearSix, MagnifyingGlass, Plus, SignOut } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useLocation } from "react-router";
import { Avatar, Badge, Punto, cx } from "../ds";
import { AREE, SOTTOMENU, areaDi, creazioneDellaBarra, type Area, type Creazione } from "./aree";
import type { BadgeDati } from "./BarraBasso";
import { BadgeIntero } from "./BadgeIntero";
import { etichettaScorciatoia } from "./barraRidotta";
import { Icona3D } from "./Icona3D";

type Props = {
  nome: string; badge: BadgeDati | undefined; onCrea: (c: Creazione) => void; onEsci: () => void; onCerca?: () => void;
  // Blocco 1 bis: barra ridotta a una colonna di icone (64 px). Lo stato vive nel Guscio (localStorage e Cmd B).
  ridotta?: boolean; onRiduci?: (ridotta: boolean) => void;
  // Falso quando il cambio arriva dalla tastiera: un'azione da tastiera non si anima (emil-design-eng).
  animata?: boolean;
};

// Computer: logo, pulsante di creazione, aree a gruppi, profilo.
// L'etichetta segue l'area: la prima creazione del suo foglio (Nuovo lead, Nuova automazione, Nuova fattura),
// e il pulsante apre direttamente quel foglio (QA 9); l'elenco completo resta nel "+" della testata.
// È secondario (bordo, nessun fondo accento): l'unica azione in accento è quella della pagina o del foglio (QA 8).
export function BarraLaterale({ nome, badge, onCrea, onEsci, onCerca, ridotta = false, onRiduci, animata = true }: Props) {
  const tasto = typeof navigator === "undefined" ? "Ctrl+B" : etichettaScorciatoia(navigator.platform || navigator.userAgent);
  const { punta, nuvola } = useSuggerimento();
  const interruttore = onRiduci && (
    <button type="button" aria-label={ridotta ? "Apri la barra laterale" : "Chiudi la barra laterale"} aria-expanded={!ridotta} aria-controls="barra-laterale"
      onClick={() => onRiduci(!ridotta)} {...punta(`${ridotta ? "Apri la barra" : "Chiudi la barra"}  ${tasto}`)}
      className="flex size-9 shrink-0 items-center justify-center rounded-controllo text-chrome-testo-2 transition-[background-color,color,transform] duration-(--durata-veloce) hover:bg-chrome-2 hover:text-chrome-testo active:scale-96">
      {ridotta ? <CaretDoubleRight size={18} weight="bold" aria-hidden /> : <CaretDoubleLeft size={18} weight="bold" aria-hidden />}
    </button>
  );
  return (
    <aside id="barra-laterale" data-ridotta={ridotta || undefined}
      className={cx("sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden border-r border-chrome-3 bg-chrome text-chrome-testo md:flex",
        ridotta ? "w-16" : "w-64", animata && "transition-[width] duration-(--durata-base) ease-(--ease-uscita)")}>
      {ridotta
        ? <Colonna nome={nome} badge={badge} onCrea={onCrea} onEsci={onEsci} onCerca={onCerca} interruttore={interruttore} punta={punta} />
        : <Piena nome={nome} badge={badge} onCrea={onCrea} onEsci={onEsci} onCerca={onCerca} interruttore={interruttore} />}
      {nuvola}
    </aside>
  );
}

type Interni = Omit<Props, "ridotta" | "onRiduci" | "animata"> & { interruttore: ReactNode };

function Piena({ nome, badge, onCrea, onEsci, onCerca, interruttore }: Interni) {
  const { pathname } = useLocation();
  const corrente = areaDi(pathname);
  const avvisi = badge?.avvisi ?? 0;
  const prima = creazioneDellaBarra(pathname);
  const [aperte, setAperte] = useState<Record<string, boolean>>({});
  // Larghezza fissa dentro la barra che si allarga: il contenuto non si schiaccia durante il passaggio.
  return (
    <div className="flex h-full w-64 shrink-0 flex-col">
      <div className="mt-6 mb-2 flex items-center justify-between pr-3 pl-5">
        <img src="/brand/logo-negativo.svg" alt="Acceleriamo" className="h-6 w-auto" />
        {interruttore}
      </div>
      <button type="button" data-variante="secondario" onClick={() => onCrea(prima.id)} className="m-4 flex h-11 items-center justify-center gap-2 rounded-controllo border-[1.5px] border-chrome-testo/60 font-semibold whitespace-nowrap text-chrome-testo transition-[background-color,transform] duration-(--durata-veloce) hover:bg-chrome-2 active:scale-98">
        <Plus size={20} weight="bold" aria-hidden />{prima.etichetta}
      </button>
      {/* La stessa ricerca della lente in Testata e di Cmd K: una sola ricerca per tutta l'app. */}
      {onCerca && (
        <button type="button" onClick={onCerca} className="mx-4 mb-2 flex h-11 items-center gap-2 rounded-controllo px-3 text-chrome-testo/80 transition-colors duration-(--durata-veloce) hover:bg-chrome-2 hover:text-chrome-testo">
          <MagnifyingGlass size={18} weight="bold" aria-hidden /><span className="flex-1 text-left">Cerca</span><kbd className="font-sans text-meta text-chrome-testo/60">/</kbd>
        </button>
      )}
      <nav aria-label="Aree" className="flex-1 overflow-y-auto px-2">
        {AREE.map((a) => {
          const aperta = aperte[a.id] ?? corrente === a.id;
          const n = contaArea(a.id, badge);
          return (
            <div key={a.id} className="mb-1">
              <button type="button" data-area={a.id} aria-expanded={aperta} onClick={() => setAperte({ ...aperte, [a.id]: !aperta })}
                className={cx("flex h-11 w-full items-center gap-3 rounded-controllo px-3 transition-colors duration-(--durata-veloce) hover:bg-chrome-2", corrente === a.id ? "bg-chrome-2 text-chrome-testo" : "text-chrome-testo-2")}>
                <Icona3D area={a.id} attiva={corrente === a.id} misura={24} />
                <span className="flex-1 text-left font-semibold">{a.etichetta}</span>
                {a.id === "commerciale" ? <BadgeIntero n={n} etichetta="da fare oggi" /> : <Badge n={n} />}
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
        {/* Stesso punto della testata del telefono (rilievo del Piano A); con avvisi non letti l'avatar porta agli Avvisi. */}
        <Link to={avvisi > 0 ? "/impostazioni/avvisi" : "/impostazioni"} aria-label={avvisi > 0 ? "Avvisi da leggere" : "Profilo e impostazioni"} className="relative flex shrink-0 items-center rounded-controllo">
          <Avatar nome={nome} />
          {badge?.avatar && <span className="absolute -top-0.5 -right-0.5"><Punto colore="accento" etichetta={avvisi > 0 ? "Avvisi da leggere" : "Un'integrazione chiede attenzione"} /></span>}
        </Link>
        <span className="flex-1 truncate text-secondaria">{nome}</span>
        <Link to="/impostazioni" aria-label="Impostazioni" className="flex size-10 items-center justify-center rounded-controllo hover:bg-chrome-2"><GearSix size={20} weight="bold" aria-hidden /></Link>
        <button type="button" aria-label="Esci" onClick={onEsci} className="flex size-10 items-center justify-center rounded-controllo hover:bg-chrome-2"><SignOut size={20} weight="bold" aria-hidden /></button>
      </div>
    </div>
  );
}

const contaArea = (a: Area, badge: BadgeDati | undefined) => (a === "commerciale" ? badge?.commerciale ?? 0 : a === "economia" ? badge?.economia ?? 0 : 0);
// Stessa regola del NavLink della barra aperta: Cruscotto e Pannello solo a percorso esatto.
const voceAttiva = (pathname: string, p: string) => pathname === p || (p !== "/economia" && p !== "/automazioni" && pathname.startsWith(p + "/"));
const icona = "relative flex size-11 items-center justify-center rounded-controllo transition-[background-color,color,transform] duration-(--durata-veloce) hover:bg-chrome-2 active:scale-96";

// Colonna ridotta: solo icone, ognuna col suo suggerimento; le aree aprono un menu a comparsa che fa da
// suggerimento (porta il nome dell'area in testa) e mostra le voci.
function Colonna({ nome, badge, onCrea, onEsci, onCerca, interruttore, punta }: Interni & { punta: Punta }) {
  const { pathname } = useLocation();
  const corrente = areaDi(pathname);
  const avvisi = badge?.avvisi ?? 0;
  const prima = creazioneDellaBarra(pathname);
  const menu = useMenuArea();
  return (
    <div className="flex h-full w-16 shrink-0 flex-col">
      <div className="mt-6 flex flex-col items-center gap-2">
        <img src="/brand/nodo-arancione.svg" alt="Acceleriamo" className="h-7 w-auto" />
        {interruttore}
      </div>
      <div className="mt-3 flex flex-col items-center gap-1">
        <button type="button" data-variante="secondario" aria-label={prima.etichetta} onClick={() => onCrea(prima.id)} {...punta(prima.etichetta)}
          className="flex size-11 items-center justify-center rounded-controllo border-[1.5px] border-chrome-testo/60 text-chrome-testo transition-[background-color,transform] duration-(--durata-veloce) hover:bg-chrome-2 active:scale-96">
          <Plus size={20} weight="bold" aria-hidden />
        </button>
        {onCerca && (
          <button type="button" aria-label="Cerca" onClick={onCerca} {...punta("Cerca  /")} className={cx(icona, "text-chrome-testo/80 hover:text-chrome-testo")}>
            <MagnifyingGlass size={20} weight="bold" aria-hidden />
          </button>
        )}
      </div>
      <nav aria-label="Aree" className="mt-3 flex flex-1 flex-col items-center gap-1 overflow-y-auto border-t border-chrome-3 pt-3">
        {AREE.map((a) => {
          const n = contaArea(a.id, badge);
          const aperto = menu.aperto?.area === a.id;
          const testo = n > 0 ? `${a.etichetta}, ${n}${a.id === "commerciale" ? " da fare oggi" : " da vedere"}` : a.etichetta;
          return (
            <button key={a.id} type="button" data-area={a.id} aria-label={testo} aria-haspopup="menu" aria-expanded={aperto} aria-controls={aperto ? menu.id : undefined}
              ref={(el) => { menu.inneschi.current[a.id] = el; }}
              {...menu.innesco(a.id)}
              className={cx(icona, corrente === a.id || aperto ? "bg-chrome-2" : "")}>
              <Icona3D area={a.id} attiva={corrente === a.id} misura={24} />
              {n > 0 && <span className="absolute -top-1 -right-1" aria-hidden>{a.id === "commerciale" ? <BadgeIntero n={n} etichetta="da fare oggi" /> : <Badge n={n} />}</span>}
            </button>
          );
        })}
      </nav>
      <div className="flex flex-col items-center gap-1 border-t border-chrome-3 py-3">
        <Link to={avvisi > 0 ? "/impostazioni/avvisi" : "/impostazioni"} aria-label={avvisi > 0 ? "Avvisi da leggere" : "Profilo e impostazioni"} {...punta(avvisi > 0 ? "Avvisi da leggere" : nome)} className={icona}>
          <Avatar nome={nome} />
          {badge?.avatar && <span className="absolute top-0.5 right-0.5"><Punto colore="accento" etichetta={avvisi > 0 ? "Avvisi da leggere" : "Un'integrazione chiede attenzione"} /></span>}
        </Link>
        <Link to="/impostazioni" aria-label="Impostazioni" {...punta("Impostazioni")} className={icona}><GearSix size={20} weight="bold" aria-hidden /></Link>
        <button type="button" aria-label="Esci" onClick={onEsci} {...punta("Esci")} className={icona}><SignOut size={20} weight="bold" aria-hidden /></button>
      </div>
      {/* Nel body: la barra è sticky (contesto di sovrapposizione suo) e il contenuto della pagina le passerebbe sopra. */}
      {menu.aperto && createPortal(
        <div id={menu.id} role="menu" aria-label={AREE.find((a) => a.id === menu.aperto!.area)!.etichetta} ref={menu.pannello}
          onKeyDown={menu.suTastoMenu} onMouseEnter={menu.resta} onMouseLeave={menu.lascia}
          style={{ top: menu.aperto.y, left: 64 + 6 }}
          className="fixed z-50 w-56 origin-top-left animate-[appare_var(--durata-veloce)_var(--ease-uscita)] rounded-controllo border border-chrome-3 bg-chrome p-1.5 text-chrome-testo shadow-[0_8px_24px_rgb(0_0_0/0.28)]">
          <p className="px-3 pt-1.5 pb-1 font-semibold" aria-hidden>{AREE.find((a) => a.id === menu.aperto!.area)!.etichetta}</p>
          {SOTTOMENU[menu.aperto.area].map((s) => {
            const attiva = voceAttiva(pathname, s.percorso);
            return (
              <Link key={s.percorso} to={s.percorso} role="menuitem" aria-current={attiva ? "page" : undefined} onClick={menu.chiudi}
                className={cx("flex h-10 items-center rounded-controllo px-3 text-secondaria transition-colors duration-(--durata-veloce) focus-visible:bg-chrome-2",
                  attiva ? "bg-chrome-2 font-medium text-chrome-testo shadow-[inset_3px_0_0_var(--accento)]" : "text-chrome-testo-2 hover:bg-chrome-2 hover:text-chrome-testo")}>
                {s.etichetta}
              </Link>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

// Menu a comparsa delle aree nella colonna ridotta.
// Passaggio del mouse: si apre, e si richiude poco dopo che il mouse lascia icona e menu.
// Clic o tastiera (Invio, Spazio, freccia giù): si apre fisso, il fuoco va sulla prima voce.
// Si chiude con Esc (fuoco torna all'icona), Tab, clic fuori o clic su una voce.
function useMenuArea() {
  const id = useId();
  const [aperto, setAperto] = useState<{ area: Area; y: number; fisso: boolean } | null>(null);
  const inneschi = useRef<Partial<Record<Area, HTMLButtonElement | null>>>({});
  const pannello = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fuocoPrima = useRef(false);

  const posizione = (area: Area) => {
    const r = inneschi.current[area]?.getBoundingClientRect();
    // Il menu parte all'altezza dell'icona ma non esce dal fondo della finestra.
    return r ? Math.max(8, Math.min(r.top - 6, window.innerHeight - 340)) : 0;
  };
  const apri = (area: Area, fisso: boolean) => { clearTimeout(timer.current); setAperto({ area, y: posizione(area), fisso }); };
  const chiudi = () => { clearTimeout(timer.current); setAperto(null); };
  const resta = () => clearTimeout(timer.current);
  const lascia = () => { if (aperto && !aperto.fisso) timer.current = setTimeout(() => setAperto(null), 160); };

  useEffect(() => {
    if (!aperto) return;
    if (fuocoPrima.current) { fuocoPrima.current = false; pannello.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(); }
    const fuori = (e: PointerEvent) => {
      const t = e.target as Node;
      if (pannello.current?.contains(t) || inneschi.current[aperto.area]?.contains(t)) return;
      setAperto(null);
    };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { setAperto(null); inneschi.current[aperto.area]?.focus(); } };
    document.addEventListener("pointerdown", fuori);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fuori); document.removeEventListener("keydown", esc); };
  }, [aperto]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const innesco = (area: Area) => ({
    onMouseEnter: () => { if (!aperto?.fisso || aperto.area !== area) apri(area, false); },
    onMouseLeave: lascia,
    onClick: (e: MouseEvent) => {
      // Un clic da tastiera (detail 0) passa da onKeyDown; col mouse il clic fissa il menu o lo chiude se era già fisso.
      if (e.detail === 0) return;
      if (aperto?.area === area && aperto.fisso) chiudi(); else apri(area, true);
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        if (aperto?.area === area && aperto.fisso && e.key !== "ArrowDown") return chiudi();
        fuocoPrima.current = true; apri(area, true);
      }
    },
  });

  const suTastoMenu = (e: KeyboardEvent) => {
    const voci = [...(pannello.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = voci.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      voci[(i + (e.key === "ArrowDown" ? 1 : voci.length - 1)) % voci.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault(); voci[e.key === "Home" ? 0 : voci.length - 1]?.focus();
    } else if (e.key === "Tab") {
      chiudi();
    }
  };

  return { id, aperto, inneschi, pannello, innesco, chiudi, resta, lascia, suTastoMenu };
}

// Suggerimento col nome accanto all'icona: posizione fissa (la barra taglia ciò che esce), ritardo al primo,
// subito ai successivi mentre si scorre la colonna. Solo visivo: l'icona ha già il suo aria-label.
type Punta = (testo: string) => { onMouseEnter: (e: MouseEvent<HTMLElement>) => void; onMouseLeave: () => void; onFocus: (e: FocusEvent<HTMLElement>) => void; onBlur: () => void };
function useSuggerimento() {
  const [vista, setVista] = useState<{ testo: string; y: number; x: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const caldo = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const mostra = (testo: string, el: HTMLElement, subito: boolean) => {
    clearTimeout(timer.current);
    const r = el.getBoundingClientRect();
    const v = { testo, y: r.top + r.height / 2, x: r.right + 10 };
    if (subito || Date.now() - caldo.current < 400) setVista(v);
    else timer.current = setTimeout(() => setVista(v), 350);
  };
  const nascondi = () => { clearTimeout(timer.current); setVista((v) => { if (v) caldo.current = Date.now(); return null; }); };
  const punta: Punta = (testo) => ({
    onMouseEnter: (e) => mostra(testo, e.currentTarget, false),
    onMouseLeave: nascondi,
    onFocus: (e) => { if (e.currentTarget.matches(":focus-visible")) mostra(testo, e.currentTarget, true); },
    onBlur: nascondi,
  });
  const [testo, scorciatoia] = vista ? vista.testo.split("  ") : [];
  const nuvola = vista && createPortal(
    <span role="tooltip" aria-hidden style={{ top: vista.y, left: vista.x }}
      className="pointer-events-none fixed z-50 flex -translate-y-1/2 items-center gap-2 rounded-controllo bg-chrome-2 px-2.5 py-1.5 text-secondaria font-medium whitespace-nowrap text-chrome-testo shadow-[0_4px_12px_rgb(0_0_0/0.25)]">
      {testo}{scorciatoia && <kbd className="font-sans text-meta text-chrome-testo/60">{scorciatoia}</kbd>}
    </span>,
    document.body,
  );
  return { punta, nuvola };
}
