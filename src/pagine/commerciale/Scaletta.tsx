import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunnelSimple, ListBullets, MagnifyingGlass, SquaresFour } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { api } from "../../api";
import { CardLead, Chip, Errore, Foglio, Intestazione, Pulsante, Selettore, Skeleton, StatoVuoto, campo } from "../../ds";
import { euro, quando } from "../../format";
import { useDebounced, useStages, useUsers } from "../../hooks";
import type { LeadListItem } from "../../types";
import type { Vista } from "../../../worker/leads/service";
import { FoglioEsito } from "./FoglioEsito";
import { FoglioFiltri } from "./FoglioFiltri";
import { MenuRapido } from "./MenuRapido";
import { ETICHETTE_VISTE, FILTRI_VUOTI, TUTTE, applicaCerca, filtriAttivi, listaTelefono, opzioniFase, ordinate, parametri, perFase, totali, type Filtri } from "./filtriScaletta";

type Corpo = { ids: string[]; azione: "responsabile" | "fase" | "cestino"; valore?: string | null };
const cella = "px-3 py-3 align-top";

// Spec 6.5: "dove sono tutti i lead aperti". Nessuna azione primaria in testata: il nuovo lead nasce dal "+".
export function Scaletta({ ora }: { ora?: number } = {}) {
  const qc = useQueryClient();
  const fasi = useStages();
  const utenti = useUsers();
  const [params, setParams] = useSearchParams();
  const cercaRichiesta = params.get("cerca") === "1";
  const ricerca = useRef<HTMLInputElement>(null);
  const [cercaAperta, setCercaAperta] = useState(cercaRichiesta);
  const [filtri, setFiltri] = useState<Filtri>(FILTRI_VUOTI);
  const [modo, setModo] = useState<"colonne" | "elenco">("colonne");
  const [vista, setVista] = useState<Vista>("nuovi");
  const [faseTelefono, setFaseTelefono] = useState<string>(TUTTE);
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const [aperti, setAperti] = useState<{ filtri?: boolean; esito?: LeadListItem; sposta?: string[] }>({});
  const q = useDebounced(filtri.q, 250);
  const chiave = parametri({ ...filtri, q }, modo === "elenco" ? { vista } : {});
  const leads = useQuery({ queryKey: ["leads", chiave], queryFn: () => api<{ leads: LeadListItem[] }>(`/leads${chiave ? `?${chiave}` : ""}`).then((r) => r.leads) });
  const tutte = useMemo(() => ordinate(fasi.data ?? []), [fasi.data]);
  const aperte = useMemo(() => tutte.filter((f) => f.kind === "open"), [tutte]);
  const etichetta = useMemo(() => new Map(tutte.map((f) => [f.id, f.label])), [tutte]);
  const gruppi = useMemo(() => perFase(leads.data ?? []), [leads.data]);
  const campagne = useMemo(() => [...new Set((leads.data ?? []).map((l) => l.metaCampaign).filter((c): c is string => !!c))], [leads.data]);

  // PV6: la lente della testata porta qui con ?cerca=1: campo aperto, fuoco, parametro tolto.
  useEffect(() => {
    if (applicaCerca(params, ricerca.current, (p) => setParams(p, { replace: true }))) setCercaAperta(true);
  }, [params, setParams]);
  // Aprendo la ricerca dalla lente della pagina il fuoco va subito nel campo.
  useEffect(() => { if (cercaAperta) ricerca.current?.focus(); }, [cercaAperta]);

  // Cambiando vista o filtri la selezione si azzera: niente azioni su lead che non si vedono.
  useEffect(() => setScelti(new Set()), [chiave]);

  const multipla = useMutation({
    mutationFn: (corpo: Corpo) => api<{ fatti: number }>("/leads/bulk", { method: "POST", json: corpo }),
    onSuccess: (r, corpo) => {
      const n = r.fatti === 1 ? "1 lead" : `${r.fatti} lead`;
      toast.success(corpo.azione === "cestino" ? `${n} nel cestino` : corpo.azione === "fase" ? `${n} spostati di fase` : `Responsabile cambiato a ${n}`);
      setScelti(new Set());
      for (const k of ["leads", "today", "badge"]) void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (leads.isLoading || fasi.isLoading) return <Skeleton righe={8} />;
  if (leads.error) return <Errore errore={leads.error} onRiprova={() => void leads.refetch()} />;
  if (fasi.error) return <Errore errore={fasi.error} onRiprova={() => void fasi.refetch()} />;

  const righe = leads.data ?? [];
  const nAperti = aperte.reduce((n, f) => n + (gruppi.get(f.id)?.length ?? 0), 0);
  const conFiltri = filtriAttivi(filtri);
  const vuoto = <StatoVuoto titolo="Nessun lead con questi filtri" testo={conFiltri || filtri.q ? "Togli qualche filtro o cambia la ricerca." : "I lead nuovi arrivano da Meta, dal Foglio Andrea o dal +."} />;
  const card = (l: LeadListItem) => (
    <MenuRapido key={l.id} lead={l} onEsito={() => setAperti({ esito: l })} onSposta={() => setAperti({ sposta: [l.id] })}>
      <CardLead lead={{ ...l, stageLabel: etichetta.get(l.stageId) ?? "" }} ora={ora} />
    </MenuRapido>
  );
  const listaTel = listaTelefono(faseTelefono, tutte, gruppi);
  const tuttiScelti = righe.length > 0 && righe.every((l) => scelti.has(l.id));
  const scegli = (id: string, si: boolean) => setScelti((s) => { const n = new Set(s); if (si) n.add(id); else n.delete(id); return n; });

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <Intestazione titolo="Scaletta" eyebrow={modo === "colonne" ? `${nAperti} lead aperti` : `${righe.length} lead in questa vista`} />
        <div className="flex shrink-0 items-center gap-2 pt-5">
          <Pulsante variante="icona" aria-label="Cerca" aria-expanded={cercaAperta} className="w-11 px-0!" icona={<MagnifyingGlass size={20} weight="bold" aria-hidden />}
            onClick={() => { if (cercaAperta && filtri.q) return ricerca.current?.focus(); setCercaAperta((a) => !a); }} />
          <Pulsante variante="icona" aria-label={conFiltri ? "Filtri, alcuni attivi" : "Filtri"} className="relative w-11 px-0!" icona={<FunnelSimple size={20} weight="bold" aria-hidden />}
            onClick={() => setAperti({ filtri: true })}>
            {conFiltri && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accento" aria-hidden />}
          </Pulsante>
          <div className="hidden gap-1 md:flex" role="group" aria-label="Come vedere i lead">
            <Chip selezionato={modo === "colonne"} onClick={() => setModo("colonne")}><SquaresFour size={18} weight="bold" aria-hidden /><span className="sr-only">Colonne</span></Chip>
            <Chip selezionato={modo === "elenco"} onClick={() => setModo("elenco")}><ListBullets size={18} weight="bold" aria-hidden /><span className="sr-only">Elenco</span></Chip>
          </div>
        </div>
      </div>

      {(cercaAperta || cercaRichiesta || filtri.q) && (
        <input ref={ricerca} className={campo} type="search" placeholder="Azienda, nome, telefono o email" aria-label="Cerca nei lead" value={filtri.q}
          onChange={(e) => setFiltri((f) => ({ ...f, q: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Escape") { setFiltri((f) => ({ ...f, q: "" })); setCercaAperta(false); } }} />
      )}

      {modo === "colonne" ? (
        <>
          <div className="flex flex-col gap-3 md:hidden">
            <Selettore etichetta="Fase" valore={faseTelefono} onCambia={setFaseTelefono} opzioni={opzioniFase(tutte, gruppi)} />
            {listaTel.length ? <ul className="flex flex-col gap-3">{listaTel.map(card)}</ul> : vuoto}
          </div>
          {righe.length === 0 ? (
            <div className="hidden md:block">{vuoto}</div>
          ) : (
            <div className="hidden gap-4 overflow-x-auto pb-4 md:-mx-8 md:flex md:px-8">
              {aperte.map((f) => {
                const lista = gruppi.get(f.id) ?? [];
                const t = totali(lista);
                return (
                  <section key={f.id} className="flex w-[300px] shrink-0 flex-col gap-3" aria-label={f.label}>
                    <header className="border-b border-sabbia pb-2">
                      <p className="text-titolo-card">{f.label} <span className="text-grigio">{lista.length}</span></p>
                      <p className="text-meta text-grigio tabular-nums">{euro(t.setupCents)} | {euro(t.feeCents)}</p>
                    </header>
                    <ul className="flex flex-col gap-3">{lista.map(card)}</ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="max-w-sm">
            <Selettore etichetta="Vista" valore={vista} onCambia={setVista} opzioni={ETICHETTE_VISTE.map((v) => ({ valore: v.id, etichetta: v.etichetta }))} />
          </div>
          {scelti.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-blocco border border-sabbia bg-tinta p-3" role="toolbar" aria-label="Azioni sulla selezione">
              <span className="text-secondaria font-semibold tabular-nums">{scelti.size === 1 ? "1 selezionato" : `${scelti.size} selezionati`}</span>
              <div className="min-w-64">
                <Selettore etichetta="Responsabile" segnaposto="Cambia" valore={null} onCambia={(id) => multipla.mutate({ ids: [...scelti], azione: "responsabile", valore: id })}
                  opzioni={(utenti.data ?? []).map((u) => ({ valore: u.id, etichetta: u.name }))} />
              </div>
              <Pulsante variante="secondario" onClick={() => setAperti({ sposta: [...scelti] })}>Sposta in fase</Pulsante>
              <Pulsante variante="distruttivo" inCorso={multipla.isPending && multipla.variables?.azione === "cestino"} onClick={() => multipla.mutate({ ids: [...scelti], azione: "cestino" })}>Metti nel cestino</Pulsante>
            </div>
          )}
          {righe.length === 0 ? vuoto : (
            <div className="overflow-x-auto rounded-blocco border border-sabbia bg-avorio">
              <table className="w-full min-w-[720px] text-left text-secondaria">
                <thead className="text-etichetta uppercase text-grigio">
                  <tr>
                    <th className={`${cella} w-12`}>
                      <input type="checkbox" className="size-5 accent-ink" aria-label="Seleziona tutti" checked={tuttiScelti}
                        onChange={(e) => setScelti(e.target.checked ? new Set(righe.map((l) => l.id)) : new Set())} />
                    </th>
                    <th className={cella}>Azienda</th><th className={cella}>Fase</th><th className={cella}>Prossima azione</th><th className={cella}>Arrivato</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((l) => (
                    <tr key={l.id} className="border-t border-sabbia hover:bg-crema">
                      <td className={cella}><input type="checkbox" className="size-5 accent-ink" aria-label={`Seleziona ${l.company}`} checked={scelti.has(l.id)} onChange={(e) => scegli(l.id, e.target.checked)} /></td>
                      <td className={cella}>
                        <Link to={`/commerciale/lead/${l.id}`} className="block font-semibold text-ink hover:underline">{l.company}</Link>
                        {l.contactName && <span className="block text-grigio">{l.contactName}</span>}
                      </td>
                      <td className={cella}>{etichetta.get(l.stageId) ?? l.stageId}</td>
                      <td className={cella}>
                        <span className="block">{l.nextAction ?? "Nessuna"}</span>
                        {l.nextActionAt != null && <span className="block text-grigio tabular-nums">{quando(l.nextActionAt, ora)}</span>}
                      </td>
                      <td className={`${cella} tabular-nums text-grigio`}>{quando(l.createdAt, ora)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {aperti.filtri && <FoglioFiltri filtri={filtri} campagne={campagne} onApplica={setFiltri} onChiudi={() => setAperti({})} />}
      {aperti.esito && <FoglioEsito lead={aperti.esito} onChiudi={() => setAperti({})} />}
      {aperti.sposta && (
        <Foglio aperto titolo={aperti.sposta.length === 1 ? "Sposta in fase" : `Sposta ${aperti.sposta.length} lead`} onChiudi={() => setAperti({})}>
          <div className="flex flex-col gap-3">
            <Selettore etichetta="Fase" apertoAllInizio valore={null}
              opzioni={tutte.filter((f) => !f.requiresReason && f.kind !== "won").map((f) => ({ valore: f.id, etichetta: f.label }))}
              onCambia={(id) => { multipla.mutate({ ids: aperti.sposta!, azione: "fase", valore: id }); setAperti({}); }} />
            <p className="text-meta text-grigio">Chiuso e le fasi perse si scelgono dalla scheda del lead: chiedono il motivo o i dati del vinto.</p>
          </div>
        </Foglio>
      )}
    </div>
  );
}
