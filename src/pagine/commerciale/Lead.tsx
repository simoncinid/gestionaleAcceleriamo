import { useQuery } from "@tanstack/react-query";
import { useMemo, type MouseEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api } from "../../api";
import { Errore, Skeleton, StatoVuoto, cx } from "../../ds";
import { SOURCE_LABELS, trascorso } from "../../format";
import { useOra, useStages, useUsers } from "../../hooks";
import { classePallino, classeScadenza } from "./coloriLead";
import { conteggi, filtra, leggiFiltri, ordina, scadenzaBreve, titoloLead, type RigaLead } from "./tabellaLead";

// Tabella dei lead (contratto blocco 1, sezione 4): stile foglio Google, righe da 44 px, intestazione fissa,
// zebra leggera, testo 14. Sostituisce la Scaletta. Il clic sulla riga apre la scheda.
// Larghezze (Ruling della corsia C): quelle del contratto (22, 14, 18, 11, 10, 11, 9, 5) a 1440 con la barra laterale
// lasciano 1120 px e tagliano fasi e azioni; Azioni al 5% non contiene tre bersagli da 32 px. Stesso ordine, pesi rivisti.
export const COLONNE = [
  { id: "azienda", titolo: "Azienda", largo: "18%" },
  { id: "fase", titolo: "Fase", largo: "16%" },
  { id: "dafare", titolo: "Da fare", largo: "19%" },
  { id: "scadenza", titolo: "Scadenza", largo: "11%" },
  { id: "responsabile", titolo: "Responsabile", largo: "8%" },
  { id: "fonte", titolo: "Fonte", largo: "10%" },
  { id: "contatto", titolo: "Ultimo contatto", largo: "9%" },
  { id: "azioni", titolo: "Azioni", largo: "9%" },
] as const;

const cella = "h-11 px-2.5 align-middle";
const secondaria = "block truncate text-[13px] leading-4 text-grigio";

export function Lead({ ora: oraFissa }: { ora?: number } = {}) {
  const [params] = useSearchParams();
  const vai = useNavigate();
  const ora = useOra(60_000, oraFissa);
  const fasi = useStages();
  const utenti = useUsers();
  const leads = useQuery({ queryKey: ["leads", "tabella"], queryFn: () => api<{ leads: RigaLead[] }>("/leads").then((r) => r.leads) });
  const filtri = useMemo(() => leggiFiltri(params), [params]);
  const righe = useMemo(() => ordina(filtra(leads.data ?? [], filtri), filtri, fasi.data ?? []), [leads.data, filtri, fasi.data]);

  if (leads.isLoading || fasi.isLoading) return <Skeleton righe={8} />;
  if (leads.error) return <Errore errore={leads.error} onRiprova={() => void leads.refetch()} />;
  if (fasi.error) return <Errore errore={fasi.error} onRiprova={() => void fasi.refetch()} />;

  const n = conteggi(leads.data ?? [], filtri);
  const etichetta = new Map((fasi.data ?? []).map((f) => [f.id, f.label]));
  const nome = new Map((utenti.data ?? []).map((u) => [u.id, u.name]));
  const apri = (id: string) => vai(`/commerciale/lead/${id}`);
  // Il clic su un link o un pulsante dentro la riga fa il suo lavoro, non apre la scheda.
  const clicRiga = (e: MouseEvent, id: string) => { if (!(e.target as HTMLElement).closest("a, button, [role=dialog]")) apri(id); };
  const vuoto = <StatoVuoto titolo="Nessun lead con questi filtri" testo="Togli un filtro o cambia la ricerca." />;

  return (
    <div className="flex flex-col gap-4 pb-8">
      <header className="flex items-start justify-between gap-3">
        <h1 className="font-sans text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] tabular-nums">{titoloLead(n)}</h1>
      </header>

      {righe.length === 0 ? vuoto : (
        <>
          {/* Computer: la tabella scorre dentro il suo contenitore, così l'intestazione resta ferma. */}
          <section aria-label="Tabella dei lead" className="hidden overflow-hidden rounded-[10px] border border-[#E5DED4] bg-avorio md:block">
            <div className="max-h-[calc(100dvh-232px)] overflow-auto overscroll-contain">
              <table className="w-full table-fixed border-collapse text-left text-[14px] leading-5">
                <colgroup>{COLONNE.map((c) => <col key={c.id} style={{ width: c.largo }} />)}</colgroup>
                <thead className="sticky top-0 z-[1] bg-avorio">
                  <tr>
                    {COLONNE.map((c) => (
                      <th key={c.id} scope="col" className={cx(cella, "h-10 whitespace-nowrap border-b border-[#E5DED4] text-[13px] font-medium text-grigio", c.id === "azioni" && "text-right")}>
                        {c.id === "azioni" ? <span className="sr-only">{c.titolo}</span> : c.titolo}
                      </th>
                    ))}
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
                      <td className={cella}><span className={cx("block truncate", !l.prossima?.azione && "text-grigio")}>{l.prossima?.azione ?? "Nessuna azione"}</span></td>
                      <td className={cx(cella, "tabular-nums")}>
                        <span className={cx("block truncate", classeScadenza(l.prossima?.stato))}>{l.prossima?.scadenza != null ? scadenzaBreve(l.prossima.scadenza, ora) : ""}</span>
                      </td>
                      <td className={cella}><span className="block truncate">{l.ownerId ? nome.get(l.ownerId) ?? "" : <span className="text-grigio">Nessuno</span>}</span></td>
                      <td className={cella}>
                        <span className="block truncate">{SOURCE_LABELS[l.source] ?? l.source}</span>
                        {l.source === "meta" && l.metaCampaign && <span className={secondaria}>{l.metaCampaign}</span>}
                      </td>
                      <td className={cx(cella, "tabular-nums")}>
                        <span className={cx("block truncate", l.ultimoContatto == null && "text-grigio")}>{l.ultimoContatto != null ? trascorso(l.ultimoContatto, ora) : "Mai"}</span>
                      </td>
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
                    {l.prossima?.scadenza != null && <span className={cx("shrink-0 text-[13px] tabular-nums", classeScadenza(l.prossima.stato))}>{scadenzaBreve(l.prossima.scadenza, ora)}</span>}
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
