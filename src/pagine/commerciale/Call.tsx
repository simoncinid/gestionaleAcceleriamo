import { useQuery } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { api } from "../../api";
import { Contatto, Errore, Intestazione, Pulsante, Skeleton, StatoVuoto } from "../../ds";
import { conArticolo, momento } from "../../format";
import { useOra } from "../../hooks";
import type { CallAgenda } from "../../types";
import { daRoma, inizioGiornoRoma, partiRoma } from "../../../worker/lib/roma";
import { FoglioCall } from "./FoglioCall";
import { noteVuote } from "./note-call";

const GIORNO_MS = 86_400_000;
const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
// Una call si considera finita mezz'ora dopo l'inizio: prima resta nell'agenda (si può ancora aprire il Meet).
const DURATA = 30 * 60_000;

const ore = (ms: number) => {
  const p = partiRoma(ms);
  return `${String(p.ore).padStart(2, "0")}:${String(p.minuti).padStart(2, "0")}`;
};

function titoloGiorno(inizio: number, oggi: number) {
  const p = partiRoma(inizio);
  const base = `${GIORNI[p.settimana]} ${p.giorno}`;
  if (inizio === oggi) return `Oggi, ${base}`;
  if (inizio === inizioGiornoRoma(oggi + GIORNO_MS + 3_600_000)) return `Domani, ${base}`;
  return base;
}

// Titolo e numero sopra, le call sotto. La maiuscola del giorno la mette il CSS.
function Gruppo({ titolo, n, children }: { titolo: string; n: number; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="segno font-display text-sezione first-letter:uppercase">{titolo}</h2>
        <span className="text-nota text-grigio tabular-nums">{n}</span>
      </header>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

// Voce 34: il nome dell'azienda va a capo invece di troncarsi a 390 px.
// Blocco di una call: ora a sinistra, azienda e tipo al centro (il tocco apre il foglio), azione a destra.
function BloccoCall({ k, secondaria, meta, azione, onApri }: { k: CallAgenda; secondaria: string; meta?: string; azione: ReactNode; onApri: () => void }) {
  return (
    <li className="flex min-h-[72px] items-center gap-3 rounded-blocco border border-sabbia bg-avorio py-3 pl-4 pr-3">
      <span className="w-14 shrink-0 font-display text-sezione text-accento-testo tabular-nums">{ore(k.scheduledAt)}</span>
      <button type="button" onClick={onApri} className="min-w-0 flex-1 text-left">
        <p className="break-words text-testo font-semibold">{k.company}</p>
        <p className="break-words text-nota text-grigio">{secondaria}</p>
        {meta && <p className="text-nota text-grigio">{meta}</p>}
      </button>
      <div className="flex shrink-0">{azione}</div>
    </li>
  );
}

export function Call({ ora: oraFissa }: { ora?: number } = {}) {
  const ora = useOra(60_000, oraFissa);
  const p = partiRoma(ora);
  const lunedi = daRoma(p.anno, p.mese, p.giorno - ((p.settimana + 6) % 7));
  const domenica = partiRoma(lunedi + 6 * GIORNO_MS + 3_600_000);
  const [aperta, setAperta] = useState<CallAgenda | null>(null);
  // Agenda della settimana più i 14 giorni prima, per le call da completare.
  const q = useQuery({
    queryKey: ["calls", lunedi],
    queryFn: () => api<{ calls: CallAgenda[] }>(`/calls?da=${lunedi - 14 * GIORNO_MS}&a=${lunedi + 7 * GIORNO_MS}`).then((r) => r.calls),
  });
  const intestazione = (n?: number) => (
    <Intestazione titolo="Call" numero={n} coda="questa settimana" eyebrow={`Settimana ${conArticolo("dal", partiRoma(lunedi).giorno, String(partiRoma(lunedi).giorno))} ${conArticolo("al", domenica.giorno, String(domenica.giorno))}`} />
  );
  if (q.isLoading) return <div className="p-4 md:p-0 md:pb-8">{intestazione()}<Skeleton righe={6} /></div>;
  if (q.error) return <div className="p-4 md:p-0 md:pb-8">{intestazione()}<Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;

  const tutte = q.data ?? [];
  const settimana = tutte.filter((k) => k.scheduledAt >= lunedi);
  const oggi = inizioGiornoRoma(ora);
  // Da completare: passate senza esito, o fatte senza note.
  const daCompletare = tutte.filter((k) => k.scheduledAt + DURATA < ora && (k.outcome == null || (k.outcome === "fatta" && noteVuote(k.notes))));
  const inAgenda = settimana.filter((k) => k.scheduledAt >= oggi && !daCompletare.includes(k));
  // Il pulsante pieno va solo sulla prossima call di oggi con il link.
  const prossimaOggi = inAgenda.find((k) => k.scheduledAt >= ora - 15 * 60_000 && k.scheduledAt < oggi + GIORNO_MS && k.meetLink);
  const giorni = new Map<number, CallAgenda[]>();
  for (const k of inAgenda) {
    const g = inizioGiornoRoma(k.scheduledAt);
    giorni.set(g, [...(giorni.get(g) ?? []), k]);
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-0 md:pb-8">
      {intestazione(settimana.length)}
      {settimana.length === 0 && daCompletare.length === 0 && (
        <StatoVuoto titolo="Nessuna call questa settimana" testo="Le call fissate dal foglio dell'esito o dalla scheda lead compaiono qui." />
      )}
      {settimana.length > 0 && inAgenda.length === 0 && <p className="text-nota text-grigio">Nessun'altra call in programma questa settimana.</p>}
      {/* Sullo schermo largo i giorni stanno affiancati come colonne di un'agenda. */}
      <div className="flex flex-col gap-6 empty:hidden @5xl:grid @5xl:grid-cols-[repeat(auto-fill,minmax(320px,1fr))] @5xl:items-start @5xl:gap-x-8">
      {[...giorni.entries()].map(([g, ks]) => (
        <Gruppo key={g} titolo={titoloGiorno(g, oggi)} n={ks.length}>
          {ks.map((k) => (
            <BloccoCall key={k.id} k={k} secondaria={`Call di ${k.kind}${k.durationMin ? `, ${k.durationMin} min` : ""}`} meta={k.inviteSentAt ? "Invito mandato" : undefined} onApri={() => setAperta(k)}
              azione={k.meetLink
                ? (k.id === prossimaOggi?.id
                  ? <Contatto tipo="meet" lead={k} variante="primario" misura="md" intero />
                  // Le altre a icona sul telefono: "Apri Meet" per esteso schiacciava il nome a 78 px (QA Task 15).
                  : <Contatto tipo="meet" lead={k} variante="icona" misura="md" />)
                : <span className="text-nota text-grigio">Senza link</span>} />
          ))}
        </Gruppo>
      ))}
      {daCompletare.length > 0 && (
        <Gruppo titolo="Da completare" n={daCompletare.length}>
          {daCompletare.map((k) => (
            <BloccoCall key={k.id} k={k} secondaria={`Call di ${k.kind}, ${momento(k.scheduledAt, ora)}`} meta={k.outcome ? "Mancano le note" : "Manca l'esito"} onApri={() => setAperta(k)}
              azione={<Pulsante variante="secondario" onClick={() => setAperta(k)}>{k.outcome ? "Note" : "Esito"}</Pulsante>} />
          ))}
        </Gruppo>
      )}
      </div>
      {aperta && <FoglioCall key={aperta.id} k={aperta} onChiudi={() => setAperta(null)} />}
    </div>
  );
}
