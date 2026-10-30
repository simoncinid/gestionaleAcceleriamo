import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { api } from "../api";
import { Campo, Foglio, Pulsante, Riga } from "../ds";
import { useDebounced } from "../hooks";
import type { RispostaCerca } from "../types";
import type { Creazione } from "./aree";

const GRUPPI: [keyof RispostaCerca, string][] = [["lead", "Lead"], ["proposte", "Proposte"], ["automazioni", "Automazioni"], ["fatture", "Fatture"]];
const COMANDI: { testo: string; href?: string; crea?: Creazione }[] = [
  { testo: "Nuovo lead", crea: "lead" },
  { testo: "Registra esito", crea: "esito" },
  { testo: "Vai a Campagne", href: "/commerciale/numeri?vista=campagne" },
  { testo: "Vai a Lunedì", href: "/commerciale/oggi/lunedi" },
  { testo: "Vai al Diario", href: "/commerciale/oggi/diario" },
  { testo: "Vai ai lead", href: "/commerciale/lead" },
  { testo: "Vai a Impostazioni", href: "/impostazioni" },
];
const MINIMO = 2;

function Gruppo({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <section aria-label={titolo} className="grid gap-2">
      <h3 className="text-etichetta text-grigio">{titolo}</h3>
      <ul className="grid grid-cols-1 gap-2">{children}</ul>
    </section>
  );
}

// Spec 5.2: una sola ricerca per tutta l'app. La aprono la lente, Cmd K o Ctrl K e "/"; accetta anche comandi.
// Nessun pulsante pieno: si sceglie una riga.
export function FoglioCerca({ aperto, onChiudi, onCrea }: { aperto: boolean; onChiudi: () => void; onCrea: (c: Creazione) => void }) {
  const vai = useNavigate();
  const [q, setQ] = useState("");
  const testo = q.trim();
  const cerca = useDebounced(testo, 250);
  const r = useQuery({ queryKey: ["cerca", cerca], queryFn: () => api<RispostaCerca>(`/search?q=${encodeURIComponent(cerca)}`), enabled: aperto && cerca.length >= MINIMO });
  const comandi = COMANDI.filter((c) => !testo || c.testo.toLowerCase().includes(testo.toLowerCase()));
  const chiudi = () => { setQ(""); onChiudi(); };
  const apri = (href: string) => { chiudi(); vai(href); };
  const trovati = r.data ? GRUPPI.reduce((n, [k]) => n + r.data[k].length, 0) : 0;
  const attivo = cerca.length >= MINIMO;
  return (
    <Foglio aperto={aperto} titolo="Cerca" onChiudi={chiudi}>
      <Campo etichetta="Cerca lead, proposte, automazioni, fatture" type="search" autoFocus autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
      {attivo && r.isLoading && <p className="text-nota text-grigio" aria-live="polite">Ricerca in corso</p>}
      {attivo && r.error && (
        <div role="alert" className="grid gap-2">
          <p className="text-testo">La ricerca non ha risposto.</p>
          <div><Pulsante variante="secondario" onClick={() => void r.refetch()}>Riprova</Pulsante></div>
        </div>
      )}
      {attivo && r.data && trovati === 0 && <p className="text-nota text-grigio" aria-live="polite">{`Nessun risultato per "${cerca}"`}</p>}
      {r.data && GRUPPI.map(([k, t]) => r.data[k].length > 0 && (
        <Gruppo key={k} titolo={t}>
          {r.data[k].map((x) => <li key={x.id}><Riga peso="medio" titolo={x.titolo} secondaria={x.meta ?? undefined} onClick={() => apri(x.href)} /></li>)}
        </Gruppo>
      ))}
      {comandi.length > 0 && (
        <Gruppo titolo="Comandi">
          {comandi.map((c) => <li key={c.testo}><Riga peso="medio" titolo={c.testo} onClick={() => { chiudi(); if (c.crea) onCrea(c.crea); else if (c.href) vai(c.href); }} /></li>)}
        </Gruppo>
      )}
    </Foglio>
  );
}
