import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api } from "../../api";
import { Badge, Errore, Pulsante, Skeleton, StatoVuoto, cx } from "../../ds";
import { SOURCE_LABELS, linkTel, telefonoMostrato, trascorso } from "../../format";
import { useMe, useOra, useStages, useUsers } from "../../hooks";
import { AzioniRiga, CellaFase, FogliRiga, scegliFase, useCestina, useSpostaFase, type FoglioRiga } from "./AzioniLead";
import { classeScadenza } from "./coloriLead";
import { COLONNE, PX_AZIONI, arrivatoBreve, attivitaDi, inserzioneBreve, offertaBreve, settoreDi, useColonneLead, type IdColonna } from "./colonneLead";
import { EtichettaFase, faseDi } from "./EtichettaFase";
import { csvLead, nomeFileCsv, scaricaCsv } from "./esportaLead";
import { MenuPunti } from "./Tendina";
import { toast } from "sonner";
import { FiltriComputer, FiltriTelefono } from "./FiltriLead";
import {
  FILTRI_BASE, campagne as campagneDi, conteggi, filtra, leggiFiltri, ordina, scadenzaBreve, scriviFiltri, titoloLead, versoAlClic,
  type Filtri, type Ordine, type RigaLead,
} from "./tabellaLead";

// Tabella dei lead (contratto blocco 1, sezione 4): stile foglio Google, righe da 44 px, intestazione fissa,
// zebra leggera, testo 14. Sostituisce la Scaletta. Il clic sulla riga apre la scheda.
// Blocco 1 bis: le colonne del foglio "CRM LEAD" (colonneLead.ts), scelte da chi usa la tabella. Larghezze in px:
// se la somma sta nel contenitore la tabella lo riempie e l'intestazione resta ferma in cima alla finestra,
// se non ci sta la tabella scorre di lato dentro il suo contenitore.

const cella = "h-11 px-2.5 align-middle";
const secondaria = "block truncate text-[13px] leading-4 text-grigio";
const manca = (testo = "Manca") => <span className="text-grigio">{testo}</span>;

// Larghezza del contenitore della tabella, per decidere se scorre di lato.
function useLarghezza() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [larghezza, setLarghezza] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(([e]) => setLarghezza(e.contentRect.width));
    o.observe(el);
    return () => o.disconnect();
  }, [el]);
  return [setEl, larghezza] as const;
}

export function Lead({ ora: oraFissa }: { ora?: number } = {}) {
  const [params, setParams] = useSearchParams();
  const vai = useNavigate();
  const ora = useOra(60_000, oraFissa);
  const fasi = useStages();
  const utenti = useUsers();
  const leads = useQuery({ queryKey: ["leads", "tabella"], queryFn: () => api<{ leads: RigaLead[] }>("/leads").then((r) => r.leads) });
  // I filtri vivono nell'indirizzo: la freccia indietro dalla scheda li ritrova. Cambiarli sostituisce la voce
  // della cronologia, così "indietro" non ripassa da ogni lettera della ricerca.
  const filtri = useMemo(() => leggiFiltri(params), [params]);
  const setFiltri = (f: Filtri) => setParams(scriviFiltri(f), { replace: true });
  const tutti = leads.data ?? [];
  const righe = useMemo(() => ordina(filtra(tutti, filtri, ora), filtri, fasi.data ?? []), [tutti, filtri, fasi.data, ora]);
  const [foglio, setFoglio] = useState<FoglioRiga | null>(null);
  const sposta = useSpostaFase(fasi.data ?? []);
  const cestina = useCestina();
  const me = useMe();
  const [visibili, setVisibili] = useColonneLead(me?.id);
  const [sezione, larghezza] = useLarghezza();

  if (leads.isLoading || fasi.isLoading) return <Skeleton righe={8} />;
  if (leads.error) return <Errore errore={leads.error} onRiprova={() => void leads.refetch()} />;
  if (fasi.error) return <Errore errore={fasi.error} onRiprova={() => void fasi.refetch()} />;

  const n = conteggi(tutti, filtri, ora);
  const apri = (id: string) => vai(`/commerciale/lead/${id}`);
  // Il clic su un link o un pulsante dentro la riga fa il suo lavoro, non apre la scheda.
  const clicRiga = (e: MouseEvent, id: string) => { if (!(e.target as HTMLElement).closest("a, button, [role=dialog], [role=menu]")) apri(id); };
  // Dato del modulo o dell'offerta che manca (lead a mano, offerta non fatta): cella vuota, come nel foglio.
  const testo = (t: string, title?: string) => (t ? <span title={title ?? t} className="block truncate">{t}</span> : null);
  const contenuto = (id: IdColonna, l: RigaLead): ReactNode => {
    switch (id) {
      case "azienda": return <>
        <span className="flex min-w-0 items-center gap-2">
          <Link to={`/commerciale/lead/${l.id}`} title={l.company} className="block min-w-0 truncate font-semibold text-ink after:absolute after:inset-0 hover:underline">{l.company}</Link>
          <PallinoDocumenti n={l.novita} />
        </span>
        {l.contactName && <span className={secondaria}>{l.contactName}</span>}
      </>;
      case "telefono": return l.phone
        ? <a href={linkTel(l.phone)} className="relative z-[1] block truncate text-ink hover:underline">{telefonoMostrato(l.phone)}</a> : manca();
      case "email": return l.email
        ? <a href={`mailto:${l.email}`} title={l.email} className="relative z-[1] block truncate text-ink hover:underline">{l.email}</a> : manca();
      case "fase": return <CellaFase lead={l} fasi={fasi.data ?? []}
        onScegli={(f) => scegliFase(l, f, setFoglio, (stageId) => sposta.mutate({ lead: l, stageId, prima: l.stageId }))} />;
      case "dafare": return <>
        <span title={l.prossima?.azione ?? undefined} className={cx("block truncate", !l.prossima?.azione && "text-grigio")}>{l.prossima?.azione ?? "Nessuna azione"}</span>
        {l.prossima?.scadenza != null && (
          <span className={cx("block truncate text-[13px] leading-4 tabular-nums", classeScadenza(l.prossima.stato, l.prossima.scadenza, ora))}>{scadenzaBreve(l.prossima.scadenza, ora, l.prossima.stato)}</span>
        )}
      </>;
      case "contatto": return <span className={cx("block truncate", l.ultimoContatto == null && "text-grigio")}>{l.ultimoContatto != null ? trascorso(l.ultimoContatto, ora) : "Mai"}</span>;
      case "arrivato": return <span className="block truncate">{arrivatoBreve(l.createdAt, ora)}</span>;
      case "inserzione": return testo(inserzioneBreve(l.metaAd), l.metaAd ?? undefined);
      case "settore": return testo(settoreDi(l));
      case "attivita": return testo(attivitaDi(l));
      case "offerta": return testo(offertaBreve(l.setupCents, l.feeCents));
      case "fonte": return <>
        <span className="block truncate">{SOURCE_LABELS[l.source] ?? l.source}</span>
        {l.source === "meta" && l.metaCampaign && <span title={l.metaCampaign} className={secondaria}>{l.metaCampaign}</span>}
      </>;
    }
  };
  const ordinaPer = (o: Ordine) => setFiltri({ ...filtri, ord: o, dir: versoAlClic(filtri, o) });
  const colonne = COLONNE.filter((c) => visibili.includes(c.id));
  const totale = colonne.reduce((t, c) => t + c.px, 0) + PX_AZIONI;
  // Prima della misura (e nelle prove senza browser) si assume che ci stia.
  const largo = larghezza > 0 && totale > larghezza;
  const propsFiltri = {
    filtri, onCambia: setFiltri, fasi: fasi.data ?? [], utenti: utenti.data ?? [], campagne: campagneDi(tutti),
    senzaResponsabile: tutti.some((l) => l.ownerId == null), conta: (f: Filtri) => filtra(tutti, f, ora).length,
    colonne: visibili, onColonne: setVisibili,
  };
  const conFiltri = JSON.stringify({ ...filtri, ord: "", dir: "" }) !== JSON.stringify({ ...FILTRI_BASE, seg: filtri.seg, ord: "", dir: "" });
  const vuoto = tutti.length === 0
    ? <StatoVuoto titolo="Ancora nessun lead" testo="I lead arrivano da Meta, dal Foglio Andrea o dal pulsante Nuovo lead." />
    : <StatoVuoto titolo={filtri.seg === "scaduti" && !conFiltri ? "Nessun lead scaduto" : "Nessun lead con questi filtri"}
        testo={filtri.seg === "scaduti" && !conFiltri ? "Tutte le azioni sono in tempo." : "Togli un filtro o cambia la ricerca."}
        azione={conFiltri ? <Pulsante variante="secondario" onClick={() => setFiltri({ ...FILTRI_BASE, seg: filtri.seg })}>Togli i filtri</Pulsante> : undefined} />;

  return (
    <div className="flex flex-col gap-4 pb-8">
      <header className="flex items-start justify-between gap-3">
        <h1 className="font-sans text-[24px] md:text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] tabular-nums">{titoloLead(n)}</h1>
        {/* Esporta le righe che si vedono (filtri e ordine compresi), con tutte le colonne. */}
        <MenuPunti etichetta="Altre azioni dei lead" larghezza={220} voci={[{
          testo: righe.length === 1 ? "Esporta CSV (1 lead)" : `Esporta CSV (${righe.length} lead)`,
          onClick: () => {
            if (righe.length === 0) return void toast("Nessun lead da esportare con questi filtri");
            scaricaCsv(csvLead(righe, fasi.data ?? [], utenti.data ?? []), nomeFileCsv(Date.now()));
          },
        }]} />
      </header>

      <FiltriComputer {...propsFiltri} />
      <FiltriTelefono {...propsFiltri} />

      {righe.length === 0 ? vuoto : (
        <>
          {/* Computer: scorre la pagina, non un riquadro interno (blocco 1 bis: col riquadro alto quanto la finestra l'ultima
              riga restava a metà e la rotella sulla pagina non portava in fondo). L'intestazione resta ferma in cima alla
              finestra; overflow-clip taglia gli angoli senza creare un riquadro che scorre. Se le colonne scelte non ci
              stanno, la tabella scorre di lato: lì l'intestazione non resta ferma. */}
          <section ref={sezione} aria-label="Tabella dei lead" className="hidden overflow-clip rounded-[10px] border border-[#E5DED4] bg-avorio md:block">
            <div className={cx(largo && "overflow-x-auto")}>
              <table className="table-fixed border-collapse text-left text-[14px] leading-5" style={largo ? { width: totale } : { width: "100%", minWidth: totale }}>
                <colgroup>
                  {colonne.map((c) => <col key={c.id} style={{ width: c.px }} />)}
                  <col style={{ width: PX_AZIONI }} />
                </colgroup>
                <thead className={cx("bg-avorio", !largo && "sticky top-(--sopra-pagina) z-[1] shadow-[0_1px_0_#E5DED4]")}>
                  <tr>
                    {colonne.map((c) => (
                      <th key={c.id} scope="col" aria-sort={c.ordine && filtri.ord === c.ordine ? (filtri.dir === "asc" ? "ascending" : "descending") : undefined}
                        className={cx(cella, "h-10 whitespace-nowrap border-b border-[#E5DED4] text-[13px] font-medium text-grigio")}>
                        {c.ordine ? (
                          <button type="button" onClick={() => ordinaPer(c.ordine!)}
                            className={cx("-mx-1.5 inline-flex h-8 cursor-pointer items-center gap-1 rounded-[6px] px-1.5 hover:bg-crema hover:text-ink", filtri.ord === c.ordine && "text-ink")}>
                            {c.titolo}
                            {filtri.ord === c.ordine && (filtri.dir === "asc" ? <ArrowUp size={12} weight="bold" aria-hidden /> : <ArrowDown size={12} weight="bold" aria-hidden />)}
                          </button>
                        ) : c.titolo}
                      </th>
                    ))}
                    <th scope="col" className={cx(cella, "h-10 border-b border-[#E5DED4]")}><span className="sr-only">Azioni</span></th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((l) => (
                    <tr key={l.id} data-lead={l.id} onClick={(e) => clicRiga(e, l.id)}
                      className="cursor-pointer border-b border-[#EFE9E1] last:border-b-0 even:bg-[#FBF8F3] hover:bg-crema">
                      {colonne.map((c) => <td key={c.id} className={cx(cella, c.id === "azienda" && "relative", ["contatto", "arrivato", "telefono", "offerta"].includes(c.id) && "tabular-nums")}>{contenuto(c.id, l)}</td>)}
                      <td className={cx(cella, "px-1")}><AzioniRiga lead={l} onApri={setFoglio} onCestina={() => cestina.mutate(l)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Telefono: riga su due linee, nessuno scorrimento laterale. Il tocco apre la scheda. */}
          <ul aria-label="Lead" className="divide-y divide-[#EFE9E1] overflow-hidden rounded-[10px] border border-[#E5DED4] bg-avorio md:hidden">
            {righe.map((l) => (
              <li key={l.id}>
                <Link to={`/commerciale/lead/${l.id}`} data-lead={l.id} className="flex min-h-[60px] flex-col justify-center gap-1 px-4 py-2.5 active:bg-crema">
                  <span className="flex items-baseline gap-3">
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="min-w-0 truncate text-[15px] font-semibold">{l.company}</span>
                      <PallinoDocumenti n={l.novita} />
                    </span>
                    {l.prossima?.scadenza != null && <span className={cx("shrink-0 text-[13px] tabular-nums", classeScadenza(l.prossima.stato, l.prossima.scadenza, ora))}>{scadenzaBreve(l.prossima.scadenza, ora, l.prossima.stato)}</span>}
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-[13px] text-grigio">
                    <EtichettaFase {...faseDi(fasi.data, l.stageId)} className="shrink-0" />
                    {l.prossima?.azione && <span className="min-w-0 truncate text-ink">{l.prossima.azione}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <FogliRiga foglio={foglio} utenti={utenti.data ?? []} onChiudi={() => setFoglio(null)} />
    </div>
  );
}

// Pallino arancione col numero dei documenti caricati da altri e non ancora visti (spec documenti 29/10/2026). A zero sparisce.
function PallinoDocumenti({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="shrink-0" data-pallino={n} title={n === 1 ? "1 documento nuovo" : `${n} documenti nuovi`}><span className="sr-only">{n === 1 ? "1 documento nuovo" : `${n} documenti nuovi`}</span><span aria-hidden><Badge n={n} /></span></span>;
}
