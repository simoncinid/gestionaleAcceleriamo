import { useId, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { giorno, presetInizio, presetQuando, quando } from "../format";
import { daRoma } from "../../worker/lib/roma";
import { cx } from "./cx";
import { Selettore } from "./Selettore";

export const campo = "h-12 w-full rounded-controllo border-[1.5px] border-sabbia-2 bg-avorio px-3 text-campo text-ink focus-visible:border-ink";

export function Campo({ etichetta, aiuto, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { etichetta: string; aiuto?: string }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-nota font-medium">{etichetta}</label>
      <input id={id} {...p} className={cx(campo, className)} />
      {aiuto && <p className="text-nota text-grigio">{aiuto}</p>}
    </div>
  );
}

// Con `cresce` l'area si allunga con il contenuto, senza barra di scorrimento interna.
export function AreaTesto({ etichetta, className, cresce = false, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { etichetta: string; cresce?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const adatta = () => { const t = ref.current; if (t && cresce) { t.style.height = "auto"; t.style.height = `${t.scrollHeight + 2}px`; } };
  useLayoutEffect(adatta);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-nota font-medium">{etichetta}</label>
      <textarea id={id} ref={ref} rows={3} {...p} onInput={(e) => { adatta(); p.onInput?.(e); }} className={cx(campo, "h-auto py-2", cresce && "resize-none overflow-hidden", className)} />
    </div>
  );
}

const perInput = (ms: number) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

// "Quando" è un selettore: i preset di presetQuando (senza quelli già passati), poi "Altro giorno e ora" che apre il campo data e ora.
// L'istante di riferimento si congela al primo rendering: i preset relativi ("Tra 1 ora") non devono scivolare a ogni render.
export function CampoQuando({ etichetta, valore, onCambia, ora, apertoAllInizio = false, errore }: { etichetta: string; valore: number | null; onCambia: (ms: number | null) => void; ora?: number; apertoAllInizio?: boolean; errore?: string | null }) {
  const [base] = useState(() => ora ?? Date.now());
  const preset = useMemo(() => presetQuando(base).filter((p) => p.ms > base), [base]);
  const [scelta, setScelta] = useState<string | null>(() => {
    if (valore == null) return null;
    const i = preset.findIndex((p) => p.ms === valore);
    return i >= 0 ? String(i) : "altra";
  });
  const opzioni = [...preset.map((p, i) => ({ valore: String(i), etichetta: p.etichetta })), { valore: "altra", etichetta: "Altro giorno e ora" }];
  const altra = scelta === "altra";
  return (
    <div className="flex flex-col gap-2">
      <Selettore etichetta={etichetta} opzioni={opzioni} valore={scelta} apertoAllInizio={apertoAllInizio}
        testoValore={valore != null ? quando(valore, base) : altra ? "Scegli giorno e ora" : undefined}
        onCambia={(v) => { setScelta(v); if (v !== "altra") onCambia(preset[Number(v)].ms); }} />
      {altra && (
        <input aria-label={`${etichetta}: giorno e ora`} type="datetime-local" className={campo} value={valore ? perInput(valore) : ""}
          onChange={(e) => onCambia(e.target.value ? new Date(e.target.value).getTime() : null)} />
      )}
      {/* Minore 3 della review: il 422 della call nel passato si legge accanto alla data, non in un toast. */}
      {errore && <p role="alert" className="text-nota text-errore">{errore}</p>}
    </div>
  );
}

// Giorno senza ora (data di inizio del contratto): "Oggi", "Lunedì prossimo", "Primo del mese prossimo",
// poi "Scegli una data" che apre il campo data. Il valore è la mezzanotte di Roma del giorno scelto.
// Voce 33: finché il valore coincide con una scorciatoia la riga mostra la sua etichetta ("Oggi"), non la data.
// `scorciatoie` cambia le voci (Segna incassata: "Oggi" e "Ieri").
export function CampoGiorno({ etichetta, valore, onCambia, ora, scorciatoie = presetInizio }: {
  etichetta: string; valore: number | null; onCambia: (ms: number | null) => void; ora?: number; scorciatoie?: (ora: number) => { etichetta: string; ms: number }[];
}) {
  const [base] = useState(() => ora ?? Date.now());
  const preset = useMemo(() => scorciatoie(base), [base, scorciatoie]);
  const [scelta, setScelta] = useState<string | null>(() => {
    if (valore == null) return null;
    const i = preset.findIndex((p) => p.ms === valore);
    return i >= 0 ? String(i) : "altra";
  });
  const opzioni = [...preset.map((p, i) => ({ valore: String(i), etichetta: p.etichetta })), { valore: "altra", etichetta: "Scegli una data" }];
  const altra = scelta === "altra";
  return (
    <div className="flex flex-col gap-2">
      <Selettore etichetta={etichetta} opzioni={opzioni} valore={scelta}
        testoValore={valore != null ? (!altra && preset.find((p) => p.ms === valore)?.etichetta) || giorno(valore, base) : altra ? "Scegli una data" : undefined}
        onCambia={(v) => { setScelta(v); if (v !== "altra") onCambia(preset[Number(v)].ms); }} />
      {altra && (
        <input aria-label={`${etichetta}: giorno`} type="date" className={campo} value={valore ? giornoPerInput(valore) : ""}
          onChange={(e) => {
            const [a, m, g] = e.target.value.split("-").map(Number);
            onCambia(e.target.value ? daRoma(a, m, g) : null);
          }} />
      )}
    </div>
  );
}

const giornoPerInput = (ms: number) => {
  // Il giorno di Roma, non quello del fuso del telefono.
  const testo = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
  return testo;
};
