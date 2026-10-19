import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api } from "../../api";
import { AreaTesto, Campo, Pulsante, classiPulsante } from "../../ds";

type Risorsa = { titolo: string; sottotitolo: string; corpo: string; pdfUrl: string | null };

// Il link della scheda si mostra solo se è web: niente javascript:, data: e simili, anche se arrivassero dal database.
export const linkScheda = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

// Il corpo è testo semplice: paragrafi separati da una riga vuota, righe che iniziano con "- " in elenco.
// Nessun HTML interpretato: solo elementi React costruiti qui.
export function CorpoRisorsa({ testo }: { testo: string }) {
  const blocchi: ReactNode[] = [];
  testo.split(/\n\s*\n/).forEach((par, i) => {
    let righe: string[] = [];
    let voci: string[] = [];
    const chiudiRighe = (k: string) => { if (righe.length) blocchi.push(<p key={k} className="whitespace-pre-line">{righe.join("\n")}</p>); righe = []; };
    const chiudiVoci = (k: string) => { if (voci.length) blocchi.push(<ul key={k} className="list-disc space-y-1 pl-5">{voci.map((v, j) => <li key={j}>{v}</li>)}</ul>); voci = []; };
    par.split("\n").map((r) => r.trim()).filter(Boolean).forEach((r, j) => {
      if (r.startsWith("- ")) { chiudiRighe(`p${i}-${j}`); voci.push(r.slice(2).trim()); }
      else { chiudiVoci(`u${i}-${j}`); righe.push(r); }
    });
    chiudiRighe(`p${i}-f`);
    chiudiVoci(`u${i}-f`);
  });
  return <div className="grid gap-4 text-corpo text-ink">{blocchi}</div>;
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
    return <p role="status" className="font-display text-titolo-card text-ink">Grazie, ti chiamiamo entro un giorno lavorativo.</p>;
  }
  return (
    <form onSubmit={invia} className="grid gap-4">
      <Campo etichetta="Nome" name="nome" autoComplete="name" maxLength={120} required />
      <Campo etichetta="Azienda" name="azienda" autoComplete="organization" maxLength={120} required />
      <Campo etichetta="Telefono" name="telefono" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} required />
      <AreaTesto etichetta="Messaggio (facoltativo)" name="messaggio" maxLength={1000} />
      {/* Campo trappola: fuori vista e fuori dalla tastiera, solo i robot lo riempiono. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Sito<input name="sito" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {errore && <p role="alert" className="text-secondaria text-errore">{errore}</p>}
      <Pulsante variante="primario" misura="lg" type="submit" inCorso={inCorso} className="w-full justify-center">
        {inCorso ? "Invio in corso" : "Richiedi la chiamata"}
      </Pulsante>
    </form>
  );
}

// Pagina pubblica di una risorsa (/r/:slug): si apre senza accesso e fuori dal guscio dell'app.
export function PaginaRisorsa({ slug }: { slug: string }) {
  const q = useQuery({
    queryKey: ["risorsa-pubblica", slug],
    queryFn: () => api<Risorsa>(`/pubblico/risorse/${encodeURIComponent(slug)}`),
  });
  useEffect(() => { if (q.data) document.title = `${q.data.titolo} | Acceleriamo`; }, [q.data]);

  const cornice = (figli: ReactNode) => (
    <main className="min-h-[100dvh] bg-crema px-5 py-8 text-ink">
      <div className="relative mx-auto grid w-full max-w-xl gap-8">
        <img src="/brand/logo.svg" alt="Acceleriamo" className="h-9 justify-self-start" />
        {figli}
      </div>
    </main>
  );

  if (q.isLoading) return cornice(<p className="text-grigio">Caricamento in corso</p>);
  if (q.error instanceof ApiError && q.error.status === 404) return cornice(<h1 className="font-display text-titolo-blocco lowercase">Questa pagina non c'è più</h1>);
  if (q.error || !q.data) return cornice(<p role="alert">Non riesco a caricare la pagina: riprova tra un momento.</p>);
  const r = q.data;

  return cornice(
    <>
      <header className="grid gap-3">
        <h1 className="font-display text-titolo-pagina lowercase">{r.titolo}</h1>
        {r.sottotitolo && <p className="text-corpo text-grigio">{r.sottotitolo}</p>}
      </header>
      <CorpoRisorsa testo={r.corpo} />
      {linkScheda(r.pdfUrl) && (
        <a href={linkScheda(r.pdfUrl)!} target="_blank" rel="noopener noreferrer" className={`${classiPulsante("secondario", "lg")} w-full`}>Scarica la scheda</a>
      )}
      <section aria-labelledby="chiamata" className="grid gap-5 rounded-blocco border border-sabbia bg-avorio p-6">
        <div className="grid gap-2">
          <h2 id="chiamata" className="font-display text-titolo-blocco lowercase">Chiamata gratuita</h2>
          <p className="text-secondaria text-grigio">Lasciaci un numero: ti richiamiamo e guardiamo insieme come applicarlo alla tua azienda.</p>
        </div>
        <ModuloChiamata slug={slug} />
      </section>
    </>,
  );
}
