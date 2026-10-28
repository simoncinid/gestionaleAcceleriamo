import { CaretDown, Check, DotsThree } from "@phosphor-icons/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../ds";

// Elenco a tendina sopra la pagina, agganciato al pulsante che lo apre: serve dentro la tabella (che scorre per conto
// suo e taglierebbe un elenco normale) e nella riga dei filtri. Una voce per riga, niente ombra: bordo e fondo bianco.
// Si chiude con Esc (il fuoco torna al pulsante), con un tocco fuori, scorrendo la pagina o cambiando la finestra.
export function Tendina({ ancora, aperta, onChiudi, etichetta, larghezza = 240, children }: {
  ancora: RefObject<HTMLElement | null>; aperta: boolean; onChiudi: () => void; etichetta: string; larghezza?: number; children: ReactNode;
}) {
  const pannello = useRef<HTMLDivElement>(null);
  const [posto, setPosto] = useState<{ top: number; left: number; sopra: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!aperta) return setPosto(null);
    const a = ancora.current?.getBoundingClientRect();
    if (!a) return;
    const alto = pannello.current?.offsetHeight ?? 240;
    // Sotto il pulsante; sopra se in basso non c'è spazio. Mai fuori dai bordi della finestra.
    const sopra = a.bottom + 4 + alto > window.innerHeight - 8 && a.top - 4 - alto > 8;
    const left = Math.max(8, Math.min(a.left, window.innerWidth - larghezza - 8));
    setPosto({ top: sopra ? a.top - 4 - alto : a.bottom + 4, left, sopra });
  }, [aperta, ancora, larghezza]);
  useEffect(() => {
    if (!aperta) return;
    const fuori = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pannello.current?.contains(t) && !ancora.current?.contains(t)) onChiudi();
    };
    // Lo scorrimento dentro l'elenco stesso non lo chiude.
    const scorre = (e: Event) => { if (!pannello.current?.contains(e.target as Node)) onChiudi(); };
    document.addEventListener("pointerdown", fuori);
    window.addEventListener("scroll", scorre, true);
    window.addEventListener("resize", onChiudi);
    return () => {
      document.removeEventListener("pointerdown", fuori);
      window.removeEventListener("scroll", scorre, true);
      window.removeEventListener("resize", onChiudi);
    };
  }, [aperta, ancora, onChiudi]);
  // Il fuoco va alla voce scelta o alla prima.
  useEffect(() => {
    if (!aperta || !posto) return;
    const p = pannello.current;
    (p?.querySelector<HTMLElement>('[aria-checked="true"], [aria-selected="true"]') ?? p?.querySelector<HTMLElement>("button, a, input"))?.focus();
  }, [aperta, posto]);
  const tasti = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onChiudi(); ancora.current?.focus(); return; }
    if (e.key === "Tab") return onChiudi();
    const voci = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-voce]"));
    const i = voci.indexOf(document.activeElement as HTMLElement);
    const verso = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? voci.length - 1 : null;
    if (verso == null || voci.length === 0) return;
    e.preventDefault();
    voci[(verso + voci.length) % voci.length].focus();
  };
  if (!aperta || typeof document === "undefined") return null;
  return createPortal(
    <div ref={pannello} role="dialog" aria-label={etichetta} onKeyDown={tasti}
      style={{ top: posto?.top ?? -9999, left: posto?.left ?? -9999, width: larghezza }}
      className={cx("fixed z-40 max-h-[min(420px,70dvh)] overflow-y-auto rounded-controllo border border-sabbia-2 bg-avorio p-1",
        posto && "motion-safe:animate-[appare_150ms_var(--ease-uscita)]", posto?.sopra ? "origin-bottom" : "origin-top")}>
      {children}
    </div>,
    document.body,
  );
}

// Voce di una tendina: alta 44 px, testo a sinistra, spunta a destra quando è scelta.
export function VoceTendina({ scelta, onClick, children, ruolo = "menuitemradio", distruttiva = false }: {
  scelta?: boolean; onClick: () => void; children: ReactNode; ruolo?: "menuitemradio" | "menuitemcheckbox" | "menuitem"; distruttiva?: boolean;
}) {
  return (
    <button type="button" data-voce role={ruolo} aria-checked={ruolo === "menuitem" ? undefined : !!scelta} onClick={onClick}
      className={cx("flex min-h-11 w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-secondaria hover:bg-crema focus-visible:bg-crema focus-visible:outline-none",
        distruttiva ? "text-[#B42318]" : "text-ink")}>
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {ruolo !== "menuitem" && <span className="flex w-4 justify-end">{scelta && <Check size={16} weight="bold" aria-hidden />}</span>}
    </button>
  );
}

// Selettore a espansione compatto della riga dei filtri: riga chiusa con etichetta, valore e freccia;
// aperto mostra le voci una per riga. "multipla": ogni tocco accende o spegne una voce e l'elenco resta aperto.
export function Filtro<T extends string>({ etichetta, opzioni, valori, onCambia, multipla = false, tutte = "Tutte", chiuso, larghezza = 260 }: {
  etichetta: string; opzioni: { valore: T; etichetta: string; prima?: ReactNode }[]; valori: T[]; onCambia: (v: T[]) => void;
  multipla?: boolean; tutte?: string; larghezza?: number;
  // Testo da chiuso quando non c'è scelta (di default quello della voce "tutte"); vuoto = solo l'etichetta.
  chiuso?: string;
}) {
  const [aperta, setAperta] = useState(false);
  const ancora = useRef<HTMLButtonElement>(null);
  const id = useId();
  const scelte = opzioni.filter((o) => valori.includes(o.valore));
  const valore = scelte.length === 0 ? chiuso ?? tutte : scelte.length === 1 ? scelte[0].etichetta : `${scelte.length} scelte`;
  return (
    <>
      <button ref={ancora} type="button" aria-expanded={aperta} aria-haspopup="dialog" aria-controls={aperta ? id : undefined} onClick={() => setAperta((a) => !a)}
        data-filtro={etichetta}
        className={cx("flex h-11 min-w-0 items-center gap-2 rounded-controllo border-[1.5px] bg-avorio px-3 text-secondaria transition-colors duration-(--durata-veloce) hover:border-ink",
          scelte.length ? "border-ink" : "border-sabbia-2")}>
        <span className="shrink-0 font-medium">{etichetta}</span>
        {valore && <span className={cx("min-w-0 truncate", scelte.length ? "font-semibold text-ink" : "text-grigio")}>{valore}</span>}
        <CaretDown size={14} weight="bold" aria-hidden className={cx("shrink-0 motion-safe:transition-transform", aperta && "rotate-180")} />
      </button>
      <Tendina ancora={ancora} aperta={aperta} onChiudi={() => setAperta(false)} etichetta={etichetta} larghezza={larghezza}>
        <div id={id} role="menu" aria-label={etichetta}>
          <VoceTendina scelta={valori.length === 0} onClick={() => { onCambia([]); if (!multipla) setAperta(false); }}>{tutte}</VoceTendina>
          {opzioni.map((o) => {
            const scelta = valori.includes(o.valore);
            return (
              <VoceTendina key={o.valore} scelta={scelta} ruolo={multipla ? "menuitemcheckbox" : "menuitemradio"}
                onClick={() => {
                  if (!multipla) { onCambia([o.valore]); return setAperta(false); }
                  onCambia(scelta ? valori.filter((v) => v !== o.valore) : [...valori, o.valore]);
                }}>
                {o.prima}<span className="min-w-0 break-words">{o.etichetta}</span>
              </VoceTendina>
            );
          })}
        </div>
      </Tendina>
    </>
  );
}

// Menu "..." (riga della tabella, riga di Oggi, testata della pagina): un pulsante da 44 px e le voci una per riga.
export function MenuPunti({ etichetta, voci, larghezza = 240, piccolo = false }: {
  etichetta: string; voci: { testo: string; onClick: () => void; distruttiva?: boolean }[]; larghezza?: number; piccolo?: boolean;
}) {
  const [aperta, setAperta] = useState(false);
  const ancora = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ancora} type="button" aria-label={etichetta} aria-haspopup="menu" aria-expanded={aperta}
        onClick={(e) => { e.stopPropagation(); setAperta((a) => !a); }}
        className={cx("inline-flex shrink-0 items-center justify-center rounded-controllo text-ink transition-colors duration-(--durata-veloce) hover:bg-crema active:bg-sabbia",
          piccolo ? "size-8" : "size-11", aperta && "bg-crema")}>
        <DotsThree size={22} weight="bold" aria-hidden />
      </button>
      <Tendina ancora={ancora} aperta={aperta} onChiudi={() => setAperta(false)} etichetta={etichetta} larghezza={larghezza}>
        <div role="menu" aria-label={etichetta} onClick={(e) => e.stopPropagation()}>
          {voci.map((v) => (
            <VoceTendina key={v.testo} ruolo="menuitem" distruttiva={v.distruttiva} onClick={() => { setAperta(false); v.onClick(); }}>{v.testo}</VoceTendina>
          ))}
        </div>
      </Tendina>
    </>
  );
}
