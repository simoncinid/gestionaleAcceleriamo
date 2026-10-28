import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api } from "../../api";
import { Errore, Pulsante, Skeleton, StatoVuoto, cx } from "../../ds";
import { SOURCE_LABELS, arrivato, euro, trascorso } from "../../format";
import { useOra, useStages, useUsers } from "../../hooks";
import { classePallino, classeScadenza } from "./coloriLead";
import { FiltriComputer, FiltriTelefono } from "./FiltriLead";
import {
  FILTRI_BASE, campagne as campagneDi, conteggi, filtra, leggiFiltri, ordina, scadenzaBreve, scriviFiltri, titoloLead,
  type ColonnaExtra, type Filtri, type Ordine, type RigaLead,
} from "./tabellaLead";

// Tabella dei lead (contratto blocco 1, sezione 4): stile foglio Google, righe da 44 px, intestazione fissa,
// zebra leggera, testo 14. Sostituisce la Scaletta. Il clic sulla riga apre la scheda.
// Larghezze (Ruling della corsia C): quelle del contratto (22, 14, 18, 11, 10, 11, 9, 5) a 1440 con la barra laterale
// lasciano 1120 px e tagliano fasi e azioni; Azioni al 5% non contiene tre bersagli da 32 px. Stesso ordine, pesi rivisti.
// Con le colonne a richiesta la tabella passa a larghezze fisse in px e scorre di lato dentro il suo contenitore.
type IdColonna = "azienda" | "fase" | "dafare" | "scadenza" | "responsabile" | "fonte" | "contatto" | "azioni";
export const COLONNE: { id: IdColonna; titolo: string; largo: string; px: number; ordine?: Ordine }[] = [
  { id: "azienda", titolo: "Azienda", largo: "18%", px: 210, ordine: "azienda" },
  { id: "fase", titolo: "Fase", largo: "16%", px: 190, ordine: "fase" },
  { id: "dafare", titolo: "Da fare", largo: "19%", px: 220 },
  { id: "scadenza", titolo: "Scadenza", largo: "11%", px: 130, ordine: "scadenza" },
  { id: "responsabile", titolo: "Responsabile", largo: "8%", px: 110 },
  { id: "fonte", titolo: "Fonte", largo: "10%", px: 130 },
  { id: "contatto", titolo: "Ultimo contatto", largo: "9%", px: 130, ordine: "contatto" },
  { id: "azioni", titolo: "Azioni", largo: "9%", px: 110 },
];
const PX_EXTRA: Record<ColonnaExtra, number> = { telefono: 160, email: 230, punteggio: 110, arrivato: 110, tentativi: 100, proposta: 210 };
const TITOLO_EXTRA: Record<ColonnaExtra, string> = { telefono: "Telefono", email: "Email", punteggio: "Punteggio", arrivato: "Arrivato il", tentativi: "Tentativi", proposta: "Proposta" };
const PUNTEGGIO = { verde: "Verde", giallo: "Giallo", grigio: "Grigio" } as const;

const cella = "h-11 px-2.5 align-middle";
const secondaria = "block truncate text-[13px] leading-4 text-grigio";

function cellaExtra(c: ColonnaExtra, l: RigaLead, ora: number): ReactNode {
  switch (c) {
    case "telefono": return l.phone ?? <span className="text-grigio">Manca</span>;
    case "email": return l.email ?? <span className="text-grigio">Manca</span>;
    case "punteggio": return l.score ? PUNTEGGIO[l.score] : <span className="text-grigio">Nessuno</span>;
    case "arrivato": return arrivato(l.createdAt, ora);
    case "tentativi": return l.attemptCount;
    case "proposta": return l.setupCents != null || l.feeCents != null ? `${euro(l.setupCents ?? 0)} + ${euro(l.feeCents ?? 0)} al mese` : <span className="text-grigio">Nessuna</span>;
  }
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
  const righe = useMemo(() => ordina(filtra(tutti, filtri), filtri, fasi.data ?? []), [tutti, filtri, fasi.data]);

  if (leads.isLoading || fasi.isLoading) return <Skeleton righe={8} />;
  if (leads.error) return <Errore errore={leads.error} onRiprova={() => void leads.refetch()} />;
  if (fasi.error) return <Errore errore={fasi.error} onRiprova={() => void fasi.refetch()} />;

  const n = conteggi(tutti, filtri);
  const etichetta = new Map((fasi.data ?? []).map((f) => [f.id, f.label]));
  // Nella colonna stretta basta il nome di battesimo; quello intero sta nel title.
  const nome = new Map((utenti.data ?? []).map((u) => [u.id, u.name]));
  const apri = (id: string) => vai(`/commerciale/lead/${id}`);
  // Il clic su un link o un pulsante dentro la riga fa il suo lavoro, non apre la scheda.
  const clicRiga = (e: MouseEvent, id: string) => { if (!(e.target as HTMLElement).closest("a, button, [role=dialog], [role=menu]")) apri(id); };
  const ordinaPer = (o: Ordine) => setFiltri({ ...filtri, ord: o, dir: filtri.ord === o && filtri.dir === "asc" ? "desc" : "asc" });
  const extra = filtri.col;
  const largo = extra.length > 0;
  const larghezzaFissa = COLONNE.reduce((t, c) => t + c.px, 0) + extra.reduce((t, c) => t + PX_EXTRA[c], 0);
  const propsFiltri = {
    filtri, onCambia: setFiltri, fasi: fasi.data ?? [], utenti: utenti.data ?? [], campagne: campagneDi(tutti),
    senzaResponsabile: tutti.some((l) => l.ownerId == null), conta: (f: Filtri) => filtra(tutti, f).length,
  };
  const conFiltri = JSON.stringify({ ...filtri, ord: "", dir: "", col: [] }) !== JSON.stringify({ ...FILTRI_BASE, seg: filtri.seg, ord: "", dir: "", col: [] });
  const vuoto = tutti.length === 0
    ? <StatoVuoto titolo="Ancora nessun lead" testo="I lead arrivano da Meta, dal Foglio Andrea o dal pulsante Nuovo lead." />
    : <StatoVuoto titolo={filtri.seg === "scaduti" && !conFiltri ? "Nessun lead scaduto" : "Nessun lead con questi filtri"}
        testo={filtri.seg === "scaduti" && !conFiltri ? "Tutte le azioni sono in tempo." : "Togli un filtro o cambia la ricerca."}
        azione={conFiltri ? <Pulsante variante="secondario" onClick={() => setFiltri({ ...FILTRI_BASE, seg: filtri.seg, col: filtri.col })}>Togli i filtri</Pulsante> : undefined} />;

  return (
    <div className="flex flex-col gap-4 pb-8">
      <header className="flex items-start justify-between gap-3">
        <h1 className="font-sans text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] tabular-nums">{titoloLead(n)}</h1>
      </header>

      <FiltriComputer {...propsFiltri} />
      <FiltriTelefono {...propsFiltri} />

      {righe.length === 0 ? vuoto : (
        <>
          {/* Computer: la tabella scorre dentro il suo contenitore, così l'intestazione resta ferma. */}
          <section aria-label="Tabella dei lead" className="hidden overflow-hidden rounded-[10px] border border-[#E5DED4] bg-avorio md:block">
            <div className="max-h-[calc(100dvh-292px)] overflow-auto overscroll-contain">
              <table className={cx("table-fixed border-collapse text-left text-[14px] leading-5", !largo && "w-full")} style={largo ? { width: larghezzaFissa } : undefined}>
                <colgroup>
                  {COLONNE.filter((c) => c.id !== "azioni").map((c) => <col key={c.id} style={{ width: largo ? c.px : c.largo }} />)}
                  {extra.map((c) => <col key={c} style={{ width: PX_EXTRA[c] }} />)}
                  <col style={{ width: largo ? COLONNE[7].px : COLONNE[7].largo }} />
                </colgroup>
                <thead className="sticky top-0 z-[1] bg-avorio">
                  <tr>
                    {COLONNE.filter((c) => c.id !== "azioni").map((c) => (
                      <th key={c.id} scope="col" aria-sort={c.ordine && filtri.ord === c.ordine ? (filtri.dir === "asc" ? "ascending" : "descending") : undefined}
                        className={cx(cella, "h-10 whitespace-nowrap border-b border-[#E5DED4] text-[13px] font-medium text-grigio")}>
                        {c.ordine ? (
                          <button type="button" onClick={() => ordinaPer(c.ordine!)}
                            className={cx("-mx-1.5 inline-flex h-8 items-center gap-1 rounded-[6px] px-1.5 hover:bg-crema hover:text-ink", filtri.ord === c.ordine && "text-ink")}>
                            {c.titolo}
                            {filtri.ord === c.ordine && (filtri.dir === "asc" ? <ArrowUp size={12} weight="bold" aria-hidden /> : <ArrowDown size={12} weight="bold" aria-hidden />)}
                          </button>
                        ) : c.titolo}
                      </th>
                    ))}
                    {extra.map((c) => <th key={c} scope="col" className={cx(cella, "h-10 whitespace-nowrap border-b border-[#E5DED4] text-[13px] font-medium text-grigio")}>{TITOLO_EXTRA[c]}</th>)}
                    <th scope="col" className={cx(cella, "h-10 border-b border-[#E5DED4]")}><span className="sr-only">Azioni</span></th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((l) => (
                    <tr key={l.id} data-lead={l.id} onClick={(e) => clicRiga(e, l.id)}
                      className="cursor-pointer border-b border-[#EFE9E1] last:border-b-0 even:bg-[#FBF8F3] hover:bg-crema">
                      <td className={cella}>
                        <Link to={`/commerciale/lead/${l.id}`} title={l.company} className="block truncate font-semibold text-ink hover:underline">{l.company}</Link>
                        {l.contactName && <span className={secondaria}>{l.contactName}</span>}
                      </td>
                      <td className={cella}>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cx("size-2 shrink-0 rounded-full", classePallino(l.stageId))} aria-hidden />
                          <span className="truncate">{etichetta.get(l.stageId) ?? l.stageId}</span>
                        </span>
                      </td>
                      <td className={cella}><span title={l.prossima?.azione ?? undefined} className={cx("block truncate", !l.prossima?.azione && "text-grigio")}>{l.prossima?.azione ?? "Nessuna azione"}</span></td>
                      <td className={cx(cella, "tabular-nums")}>
                        <span className={cx("block truncate", classeScadenza(l.prossima?.stato))}>{l.prossima?.scadenza != null ? scadenzaBreve(l.prossima.scadenza, ora, l.prossima.stato) : ""}</span>
                      </td>
                      <td className={cella}><span title={l.ownerId ? nome.get(l.ownerId) : undefined} className="block truncate">{l.ownerId ? (nome.get(l.ownerId) ?? "").split(" ")[0] : <span className="text-grigio">Nessuno</span>}</span></td>
                      <td className={cella}>
                        <span className="block truncate">{SOURCE_LABELS[l.source] ?? l.source}</span>
                        {l.source === "meta" && l.metaCampaign && <span title={l.metaCampaign} className={secondaria}>{l.metaCampaign}</span>}
                      </td>
                      <td className={cx(cella, "tabular-nums")}>
                        <span className={cx("block truncate", l.ultimoContatto == null && "text-grigio")}>{l.ultimoContatto != null ? trascorso(l.ultimoContatto, ora) : "Mai"}</span>
                      </td>
                      {extra.map((c) => <td key={c} className={cx(cella, "tabular-nums")}><span className="block truncate">{cellaExtra(c, l, ora)}</span></td>)}
                      <td className={cx(cella, "px-1")} />
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
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{l.company}</span>
                    {l.prossima?.scadenza != null && <span className={cx("shrink-0 text-[13px] tabular-nums", classeScadenza(l.prossima.stato))}>{scadenzaBreve(l.prossima.scadenza, ora, l.prossima.stato)}</span>}
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-[13px] text-grigio">
                    <span className={cx("size-2 shrink-0 rounded-full", classePallino(l.stageId))} aria-hidden />
                    <span className="shrink-0">{etichetta.get(l.stageId) ?? l.stageId}</span>
                    {l.prossima?.azione && <span className="min-w-0 truncate text-ink">{l.prossima.azione}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
