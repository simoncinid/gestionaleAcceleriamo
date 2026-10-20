import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api } from "../../api";
import { CircleNotch } from "@phosphor-icons/react";
import { AreaTesto, Campo, classiPulsante } from "../../ds";
import { analizzaCorpo, chiaveTitolo, minutiLettura, type Blocco, type Pezzo } from "./corpoRisorsa";

type Risorsa = { titolo: string; sottotitolo: string; corpo: string; pdfUrl: string | null };

// Il link della scheda si mostra solo se è web: niente javascript:, data: e simili, anche se arrivassero dal database.
export const linkScheda = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

// Il corpo arriva in markdown minimo (vedi corpoRisorsa.ts): qui diventa solo elementi React, mai HTML interpretato.
const Testo = ({ pezzi }: { pezzi: Pezzo[] }) => <>{pezzi.map((p, i) => (p.grassetto ? <strong key={i}>{p.testo}</strong> : p.testo))}</>;

// Titolo con la parola chiave in arancione: la frase prima dei due punti, altrimenti "schema" (solo se richiesto).
// Nei titoli di sezione la frase prima dei due punti va su una riga sua, come un'etichetta.
// Nei titoli in Degular l'apostrofo dritto si stacca dalle lettere: si usa quello tipografico.
const apostrofo = (s: string) => s.replace(/'/g, "\u2019");

function TitoloConChiave({ testo: grezzo, anche }: { testo: string; anche?: boolean }) {
  const testo = apostrofo(grezzo);
  const [prima, chiave, dopo] = chiaveTitolo(testo);
  if (!chiave || (!anche && !testo.includes(":"))) return <>{testo}</>;
  return <>{prima}<span className={anche ? "text-accento" : "block text-accento"}>{chiave}</span>{anche ? dopo : dopo.trim()}</>;
}

function Elenco({ b }: { b: Extract<Blocco, { tipo: "elenco" }> }) {
  if (!b.ordinato) {
    return <ul className="risorsa-punti">{b.voci.map((v, i) => <li key={i}><Testo pezzi={v.pezzi} /></li>)}</ul>;
  }
  // Elenco numerato con il titolo del passo in grassetto: è lo schema, con i numeri grandi e il filo che li unisce.
  const schema = b.voci.filter((v) => v.guida).length * 2 >= b.voci.length;
  return (
    <ol start={b.inizio} className={schema ? "risorsa-passi" : "risorsa-numeri"}>
      {b.voci.map((v, i) => (
        <li key={i}>
          <span aria-hidden className="risorsa-numero">{b.inizio + i}</span>
          {schema && v.guida ? (
            <div className="grid gap-1.5">
              <p className="risorsa-passo">{apostrofo(v.guida)}</p>
              {v.resto.length > 0 && <p className="risorsa-descrizione"><Testo pezzi={v.resto} /></p>}
            </div>
          ) : (
            <p><Testo pezzi={v.pezzi} /></p>
          )}
        </li>
      ))}
    </ol>
  );
}

export function CorpoRisorsa({ testo }: { testo: string }) {
  return (
    <div className="risorsa-corpo">
      {analizzaCorpo(testo).map((b, i) => {
        if (b.tipo === "titolo") {
          const solo = b.pezzi.map((p) => p.testo).join("");
          return b.livello === 2
            ? <h2 key={i}><TitoloConChiave testo={solo} /></h2>
            : <h3 key={i}><Testo pezzi={b.pezzi} /></h3>;
        }
        if (b.tipo === "paragrafo") return <p key={i}><Testo pezzi={b.pezzi} /></p>;
        return <Elenco key={i} b={b} />;
      })}
    </div>
  );
}

const messaggioInvio = (err: unknown) =>
  err instanceof ApiError && err.message ? err.message : "Connessione assente: riprova tra un momento";

function ModuloChiamata({ slug }: { slug: string }) {
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [inviata, setInviata] = useState(false);

  async function invia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setInCorso(true);
    setErrore(null);
    try {
      await api(`/pubblico/risorse/${encodeURIComponent(slug)}/richiesta`, {
        method: "POST",
        json: { nome: f.get("nome"), azienda: f.get("azienda"), telefono: f.get("telefono"), messaggio: f.get("messaggio"), sito: f.get("sito") },
      });
      setInviata(true);
    } catch (err) {
      setErrore(messaggioInvio(err));
    } finally {
      setInCorso(false);
    }
  }

  if (inviata) {
    return <p role="status" className="font-display text-[1.75rem] font-medium leading-[1.05] lowercase text-ink">Grazie, ti chiamiamo entro un giorno lavorativo.</p>;
  }
  return (
    <form onSubmit={invia} className="grid gap-4">
      <Campo etichetta="Nome" name="nome" autoComplete="name" maxLength={120} required />
      <Campo etichetta="Azienda" name="azienda" autoComplete="organization" maxLength={120} required />
      <Campo etichetta="Telefono" name="telefono" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} required />
      <AreaTesto etichetta="Messaggio (facoltativo)" name="messaggio" maxLength={1000} />
      {/* Campo trappola: fuori vista e fuori dalla tastiera, solo i robot lo riempiono. */}
      <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0 [clip-path:inset(50%)]">
        <label>Sito<input name="sito" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {errore && <p role="alert" className="rounded-controllo bg-avorio px-3 py-2.5 text-secondaria font-medium text-errore">{errore}</p>}
      <button type="submit" disabled={inCorso} aria-busy={inCorso || undefined} className="risorsa-invia">
        {inCorso && <CircleNotch size={20} weight="bold" className="spinner animate-spin" aria-hidden />}
        {inCorso ? "Invio in corso" : "Richiedi la chiamata"}
      </button>
    </form>
  );
}

// Pagina pubblica di una risorsa (/r/:slug): si apre senza accesso e fuori dal guscio dell'app.
// Quasi sempre dal telefono, dentro il browser di Instagram: una colonna sola, testo grande, nessuno scorrimento di lato.
export function PaginaRisorsa({ slug }: { slug: string }) {
  const q = useQuery({
    queryKey: ["risorsa-pubblica", slug],
    queryFn: () => api<Risorsa>(`/pubblico/risorse/${encodeURIComponent(slug)}`),
  });
  useEffect(() => { if (q.data) document.title = `${q.data.titolo} | Acceleriamo`; }, [q.data]);

  const cornice = (figli: ReactNode) => (
    <main className="risorsa min-h-[100dvh] overflow-x-clip bg-crema pb-0 text-ink">
      <div className="relative mx-auto grid w-full max-w-[40rem] grid-cols-[minmax(0,1fr)] px-5 pt-6 sm:px-8 sm:pt-10">
        {/* Larghezza e altezza scritte: il logo non dipende dal rapporto dell'SVG per avere la sua misura. */}
        <img src="/brand/logo.svg" alt="Acceleriamo" width={149} height={32} className="risorsa-entra h-8 w-auto max-w-full justify-self-start" />
        {figli}
      </div>
    </main>
  );

  if (q.isLoading) return cornice(<p className="mt-12 text-grigio">Caricamento in corso</p>);
  if (q.error instanceof ApiError && q.error.status === 404) return cornice(<h1 className="risorsa-titolo mt-12 pb-16">Questa pagina non c'è più</h1>);
  if (q.error || !q.data) return cornice(<p role="alert" className="mt-12 pb-16">Non riesco a caricare la pagina: riprova tra un momento.</p>);
  const r = q.data;
  const scheda = linkScheda(r.pdfUrl);

  return cornice(
    <>
      <header className="mt-10 grid gap-4 border-b border-sabbia pb-8 sm:mt-14">
        <h1 className="risorsa-titolo risorsa-entra [--i:1]"><TitoloConChiave testo={r.titolo} anche /></h1>
        {r.sottotitolo && <p className="risorsa-entra risorsa-sottotitolo [--i:2]">{r.sottotitolo}</p>}
        <p className="risorsa-entra text-meta font-medium text-grigio [--i:3]">Si legge in {minutiLettura(r.corpo)} {minutiLettura(r.corpo) === 1 ? "minuto" : "minuti"}</p>
      </header>
      <div className="risorsa-entra pt-2 [--i:4]">
        <CorpoRisorsa testo={r.corpo} />
      </div>
      {scheda && (
        <a href={scheda} target="_blank" rel="noopener noreferrer" className={`${classiPulsante("secondario", "lg")} mt-10 w-full`}>Scarica la scheda</a>
      )}
      <section aria-labelledby="chiamata" data-superficie="accento" className="risorsa-chiamata">
        <div className="grid gap-3">
          <h2 id="chiamata" className="font-display text-[2.25rem] font-medium leading-[0.95] tracking-[-0.02em] lowercase">
            chiamata <span className="text-avorio">gratuita</span>
          </h2>
          <p className="text-[1.0625rem] leading-[1.5]">Lasciaci un numero: ti richiamiamo e guardiamo insieme come applicarlo alla tua azienda.</p>
        </div>
        <ModuloChiamata slug={slug} />
      </section>
    </>,
  );
}
