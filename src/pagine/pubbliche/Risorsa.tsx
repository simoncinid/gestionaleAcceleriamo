import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api } from "../../api";
import { CheckCircle, CircleNotch } from "@phosphor-icons/react";
import { AreaTesto, Campo, classiPulsante } from "../../ds";
import { analizzaCorpo, chiaveTitolo, eSchema, indiceSchema, minutiLettura, type Blocco, type Pezzo } from "./corpoRisorsa";
import { iconePassi, srcIcona, type NomeIcona } from "./iconePassi";

type Risorsa = { titolo: string; sottotitolo: string; corpo: string; pdfUrl: string | null };
type Elenco = Extract<Blocco, { tipo: "elenco" }>;

// Il link della scheda si mostra solo se è web: niente javascript:, data: e simili, anche se arrivassero dal database.
export const linkScheda = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

// Il corpo arriva in markdown minimo (vedi corpoRisorsa.ts): qui diventa solo elementi React, mai HTML interpretato.
const Testo = ({ pezzi }: { pezzi: Pezzo[] }) => <>{pezzi.map((p, i) => (p.grassetto ? <strong key={i}>{p.testo}</strong> : p.testo))}</>;
const solo = (pezzi: Pezzo[]) => pezzi.map((p) => p.testo).join("");

// Titolo con la parola chiave in arancione: la frase prima dei due punti, altrimenti "schema" (solo se richiesto).
// Nei titoli di sezione la frase prima dei due punti va su una riga sua, come un'etichetta.
// Nei titoli in Degular l'apostrofo dritto si stacca dalle lettere: si usa quello tipografico.
const apostrofo = (s: string) => s.replace(/'/g, "’");

function TitoloConChiave({ testo: grezzo, anche }: { testo: string; anche?: boolean }) {
  const testo = apostrofo(grezzo);
  const [prima, chiave, dopo] = chiaveTitolo(testo);
  if (!chiave || (!anche && !testo.includes(":"))) return <>{testo}</>;
  return <>{prima}<span className={anche ? "text-accento" : "block text-accento"}>{chiave}</span>{anche ? dopo : dopo.trim()}</>;
}

// I nodi dello schema salgono uno per volta quando entrano nello schermo. Senza JavaScript, o con il movimento
// ridotto, restano semplicemente fermi e visibili: la classe che li nasconde la mette solo questo effetto.
function useRivela<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.dataset.anima = "";
    const io = new IntersectionObserver(
      (voci) => voci.forEach((v) => {
        if (!v.isIntersecting) return;
        (v.target as HTMLElement).dataset.visto = "";
        io.unobserve(v.target);
      }),
      { rootMargin: "0px 0px -12% 0px" },
    );
    el.querySelectorAll(":scope > li").forEach((li) => io.observe(li));
    return () => io.disconnect();
  }, []);
  return ref;
}

// Lo schema: un nodo per passo, con il numero, il titolo, la descrizione e un'icona 3D del brand che sporge dall'angolo
// (sfondo CSS, non <img>: nel corpo non deve mai comparire un tag immagine);
// un filo arancione unisce un nodo al successivo. "ancore": il primo schema ha id="passo-N" su ogni voce, per i link dei
// messaggi su Instagram (/r/<slug>#passo-N).
function Flusso({ b, ancore }: { b: Elenco; ancore?: boolean }) {
  const ref = useRivela<HTMLOListElement>();
  const icone: NomeIcona[] = iconePassi(b.voci.map((v) => ({ titolo: v.guida ?? "", descrizione: solo(v.resto) })));
  return (
    <ol ref={ref} start={b.inizio} className="risorsa-passi">
      {b.voci.map((v, i) => (
        <li key={i} id={ancore ? `passo-${b.inizio + i}` : undefined}>
          <div className="risorsa-nodo">
            <span aria-hidden className="risorsa-icona" style={{ backgroundImage: `url(${srcIcona(icone[i])})` }} />
            <div className="risorsa-nodo-testa">
              <span aria-hidden className="risorsa-numero">{b.inizio + i}</span>
              {v.guida && <p className="risorsa-passo">{apostrofo(v.guida)}</p>}
            </div>
            {(v.guida ? v.resto : v.pezzi).length > 0 && <p className="risorsa-descrizione"><Testo pezzi={v.guida ? v.resto : v.pezzi} /></p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ElencoSemplice({ b }: { b: Elenco }) {
  if (!b.ordinato) return <ul className="risorsa-punti">{b.voci.map((v, i) => <li key={i}><Testo pezzi={v.pezzi} /></li>)}</ul>;
  return (
    <ol start={b.inizio} className="risorsa-numeri">
      {b.voci.map((v, i) => (
        <li key={i}><span aria-hidden className="risorsa-numero">{b.inizio + i}</span><p><Testo pezzi={v.pezzi} /></p></li>
      ))}
    </ol>
  );
}

// Il primo schema vive in una fascia scura, come lo schema del reel appena visto; se lo precede un titolo ##, il titolo
// entra nella fascia. Gli altri schemi del corpo (rari) restano sulla carta, con gli stessi nodi in chiaro.
export function CorpoRisorsa({ testo }: { testo: string }) {
  const blocchi = analizzaCorpo(testo);
  const primoSchema = indiceSchema(blocchi);
  const prima = blocchi[primoSchema - 1];
  const titoloNellaFascia = primoSchema > 0 && prima?.tipo === "titolo" && prima.livello === 2 ? primoSchema - 1 : -1;
  return (
    <div className="risorsa-corpo">
      {blocchi.map((b, i) => {
        if (i === titoloNellaFascia) return null;
        if (b.tipo === "titolo") {
          return b.livello === 2
            ? <h2 key={i}><TitoloConChiave testo={solo(b.pezzi)} /></h2>
            : <h3 key={i}><Testo pezzi={b.pezzi} /></h3>;
        }
        if (b.tipo === "paragrafo") return <p key={i}><Testo pezzi={b.pezzi} /></p>;
        if (i === primoSchema) {
          const t = titoloNellaFascia >= 0 ? blocchi[titoloNellaFascia] : null;
          return (
            <section key={i} className="risorsa-schema" aria-label={t?.tipo === "titolo" ? undefined : "Lo schema"}>
              {t?.tipo === "titolo" && <h2><TitoloConChiave testo={solo(t.pezzi)} anche={!solo(t.pezzi).includes(":")} /></h2>}
              <Flusso b={b as Elenco} ancore />
            </section>
          );
        }
        if (eSchema(b)) return <Flusso key={i} b={b} />;
        return <ElencoSemplice key={i} b={b as Elenco} />;
      })}
    </div>
  );
}

const messaggioInvio = (err: unknown) =>
  err instanceof ApiError && err.message ? err.message : "Connessione assente: riprova tra un momento";

function ModuloChiamata({ slug, metti }: { slug: string; metti: boolean }) {
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [inviata, setInviata] = useState(false);
  // Il campo da correggere: segnato come non valido e con il cursore sopra (niente fumetti del browser, l'errore è scritto sotto).
  const [errato, setErrato] = useState<string | null>(null);
  const modulo = useRef<HTMLFormElement>(null);
  const segna = (campo: string | null, testo: string) => {
    setErrato(campo);
    setErrore(testo);
    if (campo) modulo.current?.querySelector<HTMLInputElement>(`input[name=${campo}]`)?.focus();
  };
  // Aperto con un tocco, il cursore va subito sul primo campo; aperto dal link del messaggio no (la tastiera coprirebbe la pagina).
  useEffect(() => { if (metti) modulo.current?.querySelector<HTMLInputElement>("input[name=nome]")?.focus({ preventScroll: true }); }, [metti]);

  async function invia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const vuoto = ["nome", "azienda", "telefono"].find((c) => !String(f.get(c) ?? "").trim());
    if (vuoto) return segna(vuoto, "Scrivi nome, azienda e telefono: ci servono per chiamarti.");
    setInCorso(true);
    setErrore(null);
    setErrato(null);
    try {
      await api(`/pubblico/risorse/${encodeURIComponent(slug)}/richiesta`, {
        method: "POST",
        json: { nome: f.get("nome"), azienda: f.get("azienda"), telefono: f.get("telefono"), messaggio: f.get("messaggio"), sito: f.get("sito") },
      });
      setInviata(true);
    } catch (err) {
      const testo = messaggioInvio(err);
      segna(/telefono/i.test(testo) ? "telefono" : null, testo);
    } finally {
      setInCorso(false);
    }
  }

  if (inviata) {
    return (
      <div role="status" className="risorsa-grazie">
        <CheckCircle size={32} weight="fill" aria-hidden className="shrink-0 text-successo" />
        <p>Grazie, ti chiamiamo entro un giorno lavorativo.</p>
      </div>
    );
  }
  return (
    <form ref={modulo} onSubmit={invia} noValidate className="risorsa-modulo">
      <Campo etichetta="Nome" name="nome" autoComplete="name" maxLength={120} required aria-invalid={errato === "nome" || undefined} aria-describedby={errato === "nome" ? "errore-chiamata" : undefined} />
      <Campo etichetta="Azienda" name="azienda" autoComplete="organization" maxLength={120} required aria-invalid={errato === "azienda" || undefined} aria-describedby={errato === "azienda" ? "errore-chiamata" : undefined} />
      <Campo etichetta="Telefono" name="telefono" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} required aria-invalid={errato === "telefono" || undefined} aria-describedby={errato === "telefono" ? "errore-chiamata" : undefined} />
      <AreaTesto etichetta="Messaggio (facoltativo)" name="messaggio" maxLength={1000} />
      {/* Campo trappola: fuori vista e fuori dalla tastiera, solo i robot lo riempiono. */}
      <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0 [clip-path:inset(50%)]">
        <label>Sito<input name="sito" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {errore && <p id="errore-chiamata" role="alert" className="rounded-controllo bg-errore-fondo px-3 py-2.5 text-secondaria font-medium text-errore">{errore}</p>}
      <button type="submit" disabled={inCorso} aria-busy={inCorso || undefined} className="risorsa-invia">
        {inCorso && <CircleNotch size={20} weight="bold" className="spinner animate-spin" aria-hidden />}
        {inCorso ? "Invio in corso" : "Richiedi la chiamata"}
      </button>
    </form>
  );
}

// La chiusura: una domanda gentile e un solo pulsante. Il modulo si apre sul posto; dal link "#chiamata" del messaggio
// arriva già aperto, perché chi lo tocca ha già scelto.
function Chiusura({ slug }: { slug: string }) {
  const [aperto, setAperto] = useState(() => typeof window !== "undefined" && window.location.hash === "#chiamata");
  const [toccato, setToccato] = useState(false);
  return (
    <section className="risorsa-chiusura">
      <span aria-hidden className="risorsa-chiusura-icona" style={{ backgroundImage: `url(${srcIcona("telefono")})` }} />
      <h2 id="chiamata" className="risorsa-chiusura-titolo">vuoi vederlo sulla <span className="text-accento">tua azienda?</span></h2>
      <p className="risorsa-chiusura-testo">Ci racconti come lavori oggi e ti diciamo cosa si può togliere di mano. Una telefonata, senza impegno.</p>
      {aperto ? (
        <ModuloChiamata slug={slug} metti={toccato} />
      ) : (
        <div className="grid gap-3">
          <button type="button" aria-expanded={false} onClick={() => { setToccato(true); setAperto(true); }} className="risorsa-apri">Lascia il tuo numero</button>
          <p className="text-meta text-grigio">Ti richiamiamo noi, entro un giorno lavorativo.</p>
        </div>
      )}
    </section>
  );
}

function Caricamento() {
  return (
    <div aria-busy className="mt-10 grid gap-4 sm:mt-14">
      <span className="sr-only" role="status">Caricamento in corso</span>
      <div aria-hidden className="grid gap-2.5">
        <div className="skeleton h-9 w-[88%] rounded-tag" />
        <div className="skeleton h-9 w-[64%] rounded-tag" />
      </div>
      <div aria-hidden className="grid gap-2">
        <div className="skeleton h-4 w-full rounded-tag" />
        <div className="skeleton h-4 w-[80%] rounded-tag" />
      </div>
      <div aria-hidden className="skeleton -mx-5 mt-8 h-72 sm:mx-0 sm:rounded-blocco" />
    </div>
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
  // I link del messaggio su Instagram arrivano con #passo-N o #chiamata: all'apertura la pagina non c'è ancora,
  // quindi il salto all'ancora si fa a contenuto caricato.
  useEffect(() => {
    const ancora = q.data ? decodeURIComponent(window.location.hash.slice(1)) : "";
    if (!/^(passo-\d{1,3}|chiamata)$/.test(ancora)) return;
    // Si aspetta anche il font dei titoli: se arriva dopo il salto, i titoli sopra cambiano altezza e il passo scivola fuori posto.
    let via = false;
    let f = 0;
    const salta = () => { if (!via) f = requestAnimationFrame(() => document.getElementById(ancora)?.scrollIntoView({ block: "start" })); };
    salta();
    document.fonts?.ready.then(salta);
    return () => { via = true; cancelAnimationFrame(f); };
  }, [q.data]);

  const cornice = (figli: ReactNode) => (
    <main className="risorsa min-h-[100dvh] overflow-x-clip bg-crema pb-0 text-ink">
      <div className="relative mx-auto grid w-full max-w-[40rem] grid-cols-[minmax(0,1fr)] px-5 pt-6 sm:px-8 sm:pt-10">
        {/* Larghezza e altezza scritte: il logo non dipende dal rapporto dell'SVG per avere la sua misura. */}
        <img src="/brand/logo.svg" alt="Acceleriamo" width={149} height={32} className="risorsa-entra h-8 w-auto max-w-full justify-self-start" />
        {figli}
      </div>
    </main>
  );

  if (q.isLoading) return cornice(<Caricamento />);
  if (q.error instanceof ApiError && q.error.status === 404) {
    return cornice(
      <div className="risorsa-stato">
        <h1 className="risorsa-titolo" aria-label="Questa pagina non c'è più">{apostrofo("Questa pagina non c'è più")}</h1>
        <p className="risorsa-sottotitolo">Il link è vecchio oppure la risorsa è stata tolta.</p>
        <a href="https://acceleriamo.it" className={`${classiPulsante("secondario", "lg")} w-full`}>Vai al sito di Acceleriamo</a>
      </div>,
    );
  }
  if (q.error || !q.data) {
    return cornice(
      <div className="risorsa-stato">
        <h1 className="risorsa-titolo" role="alert">non si è aperta</h1>
        <p className="risorsa-sottotitolo">Non riesco a caricare la pagina: controlla la connessione e riprova.</p>
        <button type="button" onClick={() => q.refetch()} disabled={q.isFetching} className={`${classiPulsante("secondario", "lg")} w-full`}>
          {q.isFetching && <CircleNotch size={20} weight="bold" className="spinner animate-spin" aria-hidden />}
          {q.isFetching ? "Riprovo" : "Riprova"}
        </button>
      </div>,
    );
  }
  const r = q.data;
  const scheda = linkScheda(r.pdfUrl);
  const minuti = minutiLettura(r.corpo);
  const blocchi = analizzaCorpo(r.corpo);
  const schema = blocchi[indiceSchema(blocchi)];
  const passi = schema?.tipo === "elenco" ? schema.voci.length : 0;
  const lettura = `si legge in ${minuti} ${minuti === 1 ? "minuto" : "minuti"}`;

  return cornice(
    <>
      <header className="risorsa-testata">
        <h1 className="risorsa-titolo risorsa-entra [--i:1]"><TitoloConChiave testo={r.titolo} anche /></h1>
        {r.sottotitolo && <p className="risorsa-entra risorsa-sottotitolo [--i:2]">{r.sottotitolo}</p>}
        <p className="risorsa-entra risorsa-meta [--i:3]">
          {passi > 0 ? <>Schema in {passi} passi<span aria-hidden> · </span>{lettura}</> : lettura.charAt(0).toUpperCase() + lettura.slice(1)}
        </p>
      </header>
      {/* Arrivando su un'ancora il corpo non sale: lo spostamento dell'ingresso sposterebbe il punto del salto. */}
      <div className={/^#(passo-\d|chiamata)/.test(window.location.hash) ? undefined : "risorsa-entra [--i:4]"}>
        <CorpoRisorsa testo={r.corpo} />
      </div>
      {scheda && (
        <a href={scheda} target="_blank" rel="noopener noreferrer" className={`${classiPulsante("secondario", "lg")} mt-12 w-full`}>Scarica la scheda</a>
      )}
      <Chiusura slug={slug} />
    </>,
  );
}
