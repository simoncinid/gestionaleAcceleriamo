import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ETICHETTE_COLORE, intervalloInParole, type Colore } from "../../../worker/stato/calcoli";
import type { GiroStato, VoceStato } from "../../../worker/stato/routes";
import { api } from "../../api";
import { Campo, Errore, Foglio, Intestazione, Pulsante, Punto, Selettore, Skeleton, StatoVuoto } from "../../ds";
import { momento } from "../../format";
import { useOra } from "../../hooks";
import { Sezione } from "../impostazioni/parti";
import { useAutomazioni, useClienti } from "../dati-gestione";

export const useStato = () => useQuery({ queryKey: ["stato"], queryFn: () => api<{ voci: VoceStato[] }>("/stato").then((r) => r.voci), refetchInterval: 60_000 });

const ESITO: Record<GiroStato["esito"], { etichetta: string; colore: Colore }> = {
  ok: { etichetta: "Riuscito", colore: "verde" },
  errore: { etichetta: "Errore", colore: "rosso" },
  saltato: { etichetta: "Saltato, riprova al giro dopo", colore: "giallo" },
  spento: { etichetta: "Spento", colore: "grigio" },
};

// Intervalli proposti per le automazioni esterne: quanto spesso devono farsi sentire.
const INTERVALLI = [
  { valore: "5", etichetta: "Ogni 5 minuti" },
  { valore: "15", etichetta: "Ogni 15 minuti" },
  { valore: "60", etichetta: "Ogni ora" },
  { valore: "360", etichetta: "Ogni 6 ore" },
  { valore: "1440", etichetta: "Una volta al giorno" },
  { valore: "10080", etichetta: "Una volta alla settimana" },
];

const quandoProssimo = (ms: number, ora: number) => (ms <= ora ? "atteso adesso" : momento(ms, ora));

// Una riga per automazione, un'informazione per riga: nome, di chi è, stato, ultimo giro riuscito, ultimo errore e dove, prossimo giro.
function RigaVoce({ v, ora, onApri }: { v: VoceStato; ora: number; onApri: () => void }) {
  const errore = v.colore === "rosso";
  return (
    <button type="button" onClick={onApri} className="grid w-full gap-0.5 rounded-blocco border border-sabbia bg-avorio px-4 py-3 text-left hover:bg-crema">
      <span className="text-testo font-semibold">{v.nome}</span>
      <span className="text-nota text-grigio">{v.proprietario}</span>
      <span className="flex items-center gap-2 text-nota font-medium"><Punto colore={v.colore} etichetta={ETICHETTE_COLORE[v.colore]} />{v.ultimoGiroAt == null && v.colore === "grigio" && v.ultimoEsito !== "spento" ? "Mai partita" : ETICHETTE_COLORE[v.colore]}</span>
      <span className="text-nota text-grigio tabular-nums">{v.ultimoOkAt ? `Ultimo giro riuscito ${momento(v.ultimoOkAt, ora)}` : "Nessun giro riuscito"}</span>
      {errore && v.ultimoErrore && <span className="text-nota text-errore">{v.ultimoErrore}</span>}
      {errore && v.ultimoPasso && <span className="text-nota text-errore">{`Dove: ${v.ultimoPasso}`}</span>}
      {v.prossimoAt != null && <span className="text-nota text-grigio tabular-nums">{`Prossimo giro ${quandoProssimo(v.prossimoAt, ora)}`}</span>}
    </button>
  );
}

function Elenco({ voci, ora, onApri }: { voci: VoceStato[]; ora: number; onApri: (v: VoceStato) => void }) {
  return <ul className="grid gap-2">{voci.map((v) => <li key={v.id}><RigaVoce v={v} ora={ora} onApri={() => onApri(v)} /></li>)}</ul>;
}

// Esempio di battito da dare a chi scrive l'automazione: la chiave va nell'intestazione, mai nell'indirizzo.
const esempio = (chiave: string) =>
  `curl -X POST ${location.origin}/api/stato/battito \\\n  -H "Authorization: Bearer ${chiave}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"esito":"ok","messaggio":"12 schede fatte"}'`;

function Chiave({ chiave }: { chiave: string }) {
  const copia = (testo: string) => void navigator.clipboard.writeText(testo).then(() => toast.success("Copiato"), () => toast.error("Non riesco a copiare: seleziona il testo a mano"));
  return (
    <div className="grid gap-3">
      <p className="text-testo font-semibold">La chiave si vede solo adesso</p>
      <p className="text-nota">Copiala nell'automazione. Se si perde se ne fa una nuova.</p>
      <code className="break-all rounded-controllo border border-sabbia bg-crema p-3 text-nota">{chiave}</code>
      <Pulsante variante="secondario" className="justify-self-start" onClick={() => copia(chiave)}>Copia la chiave</Pulsante>
      <p className="text-nota">A ogni giro l'automazione manda "ok", oppure "errore" con il messaggio e il passo dove si è fermata.</p>
      <pre className="overflow-x-auto rounded-controllo border border-sabbia bg-crema p-3 text-nota">{esempio(chiave)}</pre>
      <Pulsante variante="fantasma" className="justify-self-start" onClick={() => copia(esempio(chiave))}>Copia l'esempio</Pulsante>
    </div>
  );
}

function FoglioNuova({ onChiudi }: { onChiudi: () => void }) {
  const qc = useQueryClient();
  const clienti = useClienti();
  const automazioni = useAutomazioni();
  const [nome, setNome] = useState("");
  const [cliente, setCliente] = useState<string>("acceleriamo");
  const [scheda, setScheda] = useState<string>("nessuna");
  const [intervallo, setIntervallo] = useState<string>("60");
  const [chiave, setChiave] = useState<string | null>(null);
  const crea = useMutation({
    mutationFn: () => api<{ id: string; chiave: string }>("/stato/voci", { method: "POST", json: {
      nome: nome.trim(), clientId: cliente === "acceleriamo" ? null : cliente, automationId: scheda === "nessuna" ? null : scheda, intervalloMin: Number(intervallo),
    } }),
    onSuccess: (r) => { setChiave(r.chiave); void qc.invalidateQueries({ queryKey: ["stato"] }); },
    onError: (e) => toast.error(e.message),
  });
  const schede = (automazioni.data?.automazioni ?? []).filter((a) => a.status !== "dismessa" && (cliente === "acceleriamo" || a.clientId === cliente));
  if (chiave) {
    return (
      <Foglio aperto titolo="Automazione aggiunta" onChiudi={onChiudi} principale={<Pulsante variante="primario" misura="lg" className="w-full" onClick={onChiudi}>Fatto</Pulsante>}>
        <Chiave chiave={chiave} />
      </Foglio>
    );
  }
  return (
    <Foglio aperto titolo="Automazione da seguire" onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={crea.isPending} motivoSpento={nome.trim() ? undefined : "Dai un nome all'automazione"} onClick={() => crea.mutate()}>Aggiungi e crea la chiave</Pulsante>}>
      <p className="text-testo">Un'automazione che gira fuori dal gestionale (sul server, da un cliente) e manda un battito a ogni giro.</p>
      <Campo etichetta="Nome in parole semplici" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Schede lead sul server" />
      <Selettore etichetta="Di chi è" valore={cliente} onCambia={(v) => { setCliente(v); setScheda("nessuna"); }}
        opzioni={[{ valore: "acceleriamo", etichetta: "Acceleriamo" }, ...(clienti.data ?? []).map((c) => ({ valore: c.id, etichetta: c.name }))]} />
      <Selettore etichetta="Scheda con il flusso" valore={scheda} onCambia={setScheda}
        opzioni={[{ valore: "nessuna", etichetta: "Nessuna scheda" }, ...schede.map((a) => ({ valore: a.id, etichetta: a.name, meta: a.cliente }))]} />
      <Selettore etichetta="Si fa sentire" valore={intervallo} onCambia={setIntervallo} opzioni={INTERVALLI} />
    </Foglio>
  );
}

function FoglioVoce({ v, ora, onChiudi }: { v: VoceStato; ora: number; onChiudi: () => void }) {
  const qc = useQueryClient();
  const giri = useQuery({ queryKey: ["stato", v.id, "giri"], queryFn: () => api<{ giri: GiroStato[] }>(`/stato/${encodeURIComponent(v.id)}/giri`).then((r) => r.giri) });
  const [chiave, setChiave] = useState<string | null>(null);
  const ricarica = () => void qc.invalidateQueries({ queryKey: ["stato"] });
  const nuovaChiave = useMutation({
    mutationFn: () => api<{ chiave: string }>(`/stato/voci/${v.id}/chiave`, { method: "POST" }),
    onSuccess: (r) => setChiave(r.chiave),
    onError: (e) => toast.error(e.message),
  });
  const accendi = useMutation({
    mutationFn: () => api(`/stato/voci/${v.id}`, { method: "PATCH", json: { attiva: !v.attiva } }),
    onSuccess: () => { toast.success(v.attiva ? "Automazione spenta" : "Automazione riaccesa"); ricarica(); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  const togli = useMutation({
    mutationFn: () => api(`/stato/voci/${v.id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Automazione tolta dallo stato"); ricarica(); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Foglio aperto titolo={v.nome} onChiudi={onChiudi} lato>
      <div className="grid gap-1">
        <p className="text-nota text-grigio">{v.proprietario}</p>
        {v.automazione && <p className="text-nota text-grigio">{`Scheda: ${v.automazione}`}</p>}
        <p className="flex items-center gap-2 text-testo font-semibold"><Punto colore={v.colore} etichetta={ETICHETTE_COLORE[v.colore]} />{ETICHETTE_COLORE[v.colore]}</p>
        <p className="text-nota text-grigio">{intervalloInParole(v.intervalloMin)}</p>
        {v.ultimoErrore && <p className="text-nota">{`Ultimo errore: ${v.ultimoErrore}`}</p>}
        {v.ultimoPasso && <p className="text-nota">{`Dove: ${v.ultimoPasso}`}</p>}
        {v.ultimoErroreAt && <p className="text-nota text-grigio tabular-nums">{momento(v.ultimoErroreAt, ora)}</p>}
      </div>
      <Sezione titolo="Ultimi giri" coda={giri.data?.length ? String(giri.data.length) : undefined}>
        {giri.isLoading ? <Skeleton righe={4} /> : giri.error ? <Errore errore={giri.error} onRiprova={() => void giri.refetch()} /> : !giri.data?.length
          ? <StatoVuoto titolo="Nessun giro ancora" testo={v.tipo === "esterno" ? "Il primo battito compare qui." : "Il primo giro compare qui."} />
          : (
            <ul className="grid gap-2">
              {giri.data.map((g) => (
                <li key={g.id} className="grid gap-0.5 rounded-blocco border border-sabbia bg-avorio px-4 py-3">
                  <p className="flex items-center gap-2 text-nota font-medium"><Punto colore={ESITO[g.esito].colore} etichetta={ESITO[g.esito].etichetta} />{ESITO[g.esito].etichetta}</p>
                  {g.messaggio && <p className="text-nota">{g.messaggio}</p>}
                  {g.passo && v.tipo === "esterno" && <p className="text-nota">{`Dove: ${g.passo}`}</p>}
                  <p className="text-nota text-grigio tabular-nums">{momento(g.at, ora)}</p>
                </li>
              ))}
            </ul>
          )}
      </Sezione>
      {v.tipo === "esterno" && (
        chiave ? <Chiave chiave={chiave} /> : (
          <div className="grid gap-2">
            <Pulsante variante="secondario" className="justify-self-start" inCorso={nuovaChiave.isPending} onClick={() => nuovaChiave.mutate()}>Crea una chiave nuova</Pulsante>
            <Pulsante variante="fantasma" className="justify-self-start" inCorso={accendi.isPending} onClick={() => accendi.mutate()}>{v.attiva ? "Spegni" : "Riaccendi"}</Pulsante>
            <Pulsante variante="distruttivo" className="justify-self-start" inCorso={togli.isPending} onClick={() => togli.mutate()}>Togli dallo stato</Pulsante>
          </div>
        )
      )}
    </Foglio>
  );
}

// Pagina Stato (spec 22/10/2026): tutte le automazioni, nostre e dei clienti. In cima quelle da guardare.
// Una sola azione piena: aggiungere un'automazione esterna da seguire.
export function StatoAutomazioni({ ora: oraFissa }: { ora?: number } = {}) {
  const ora = useOra(60_000, oraFissa);
  const q = useStato();
  const [aperto, setAperto] = useState<null | "nuova" | VoceStato>(null);
  const testata = <Intestazione titolo="Stato" eyebrow="Le automazioni, nostre e dei clienti" />;
  if (q.isLoading) return <div className="grid gap-6 p-4 md:px-0">{testata}<Skeleton righe={6} /></div>;
  if (q.error) return <div className="grid gap-6 p-4 md:px-0">{testata}<Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const voci = q.data!;
  const per = (c: Colore[]) => voci.filter((v) => c.includes(v.colore));
  const guardare = per(["rosso", "giallo"]);
  const vanno = per(["verde"]);
  const spente = per(["grigio"]);
  return (
    <div className="grid gap-8 p-4 pb-12 md:px-0">
      {testata}
      {/* Sul computer largo: riepilogo in una colonna stretta a sinistra, le sezioni a destra (affiancate quando c'è spazio). */}
      <div className="grid gap-8 @5xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] @5xl:items-start">
      <div className="grid gap-1 rounded-blocco border border-sabbia bg-avorio p-5">
        <p className="text-testo tabular-nums">{per(["rosso"]).length === 1 ? "1 in errore" : `${per(["rosso"]).length} in errore`}</p>
        <p className="text-testo tabular-nums">{`${per(["giallo"]).length} in ritardo`}</p>
        <p className="text-testo tabular-nums">{vanno.length === 1 ? "1 funziona" : `${vanno.length} funzionano`}</p>
        <p className="text-testo tabular-nums">{spente.length === 1 ? "1 spenta o mai partita" : `${spente.length} spente o mai partite`}</p>
      </div>
      <div className="grid gap-8 @7xl:grid-cols-2 @7xl:items-start">
      <Sezione titolo="Da guardare" coda={guardare.length ? String(guardare.length) : undefined}>
        {guardare.length === 0 ? <StatoVuoto titolo="Niente da guardare" testo="Tutto quello che è acceso gira nei tempi." /> : <Elenco voci={guardare} ora={ora} onApri={setAperto} />}
      </Sezione>
      <Sezione titolo="Funzionano" coda={vanno.length ? String(vanno.length) : undefined}>
        {vanno.length === 0 ? <StatoVuoto titolo="Ancora nessuna" testo="Le automazioni compaiono qui al primo giro riuscito." /> : <Elenco voci={vanno} ora={ora} onApri={setAperto} />}
      </Sezione>
      {spente.length > 0 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center py-2 text-testo font-semibold">{`Spente o mai partite, ${spente.length}`}</summary>
          <Elenco voci={spente} ora={ora} onApri={setAperto} />
        </details>
      )}
      </div>
      </div>
      <Pulsante variante="primario" misura="lg" className="w-full sm:w-auto sm:justify-self-start" onClick={() => setAperto("nuova")}>Segui un'automazione esterna</Pulsante>
      {aperto === "nuova" && <FoglioNuova onChiudi={() => setAperto(null)} />}
      {aperto && aperto !== "nuova" && <FoglioVoce v={aperto} ora={ora} onChiudi={() => setAperto(null)} />}
    </div>
  );
}
