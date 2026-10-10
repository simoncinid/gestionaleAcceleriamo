import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ETICHETTE_CANONE, ETICHETTE_COSTO, ETICHETTE_TIPO_FATTURA, type AzioneCanone } from "../../../worker/economia/calcoli";
import { api } from "../../api";
import { Campo, Foglio, Interruttore, Pulsante, Selettore, type Opzione } from "../../ds";
import { daIsoGiorno, euro, ilGiorno, isoGiorno } from "../../format";
import type { CanoneRiga, FatturaRiga } from "../../types";
import { centesimi } from "../commerciale/scheda";
import { opzioniClienti, useAutomazioni, useClienti, useRicarica } from "../dati-gestione";

type TipoFattura = keyof typeof ETICHETTE_TIPO_FATTURA;
type Categoria = keyof typeof ETICHETTE_COSTO;
const TIPI: Opzione<TipoFattura>[] = (["canone", "acconto", "saldo", "extra"] as const).map((v) => ({ valore: v, etichetta: ETICHETTE_TIPO_FATTURA[v] }));
const CATEGORIE: Opzione<Categoria>[] = (["strumenti", "costi_vivi", "altro"] as const).map((v) => ({ valore: v, etichetta: ETICHETTE_COSTO[v] }));
const NESSUNO = "nessuno";

function useScrivi(fn: () => Promise<unknown>, fatto: string, onChiudi: () => void) {
  const ricarica = useRicarica();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { toast.success(fatto); ricarica(); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
}

const Principale = ({ testo, manca, inCorso, onClick }: { testo: string; manca?: string; inCorso: boolean; onClick: () => void }) => (
  <Pulsante variante="primario" misura="lg" className="w-full" inCorso={inCorso} motivoSpento={manca} onClick={onClick}>{testo}</Pulsante>
);

export function FoglioNuovoCanone({ onChiudi }: { onChiudi: () => void }) {
  const clienti = useClienti();
  const [clientId, setClientId] = useState<string | null>(null);
  const [importo, setImporto] = useState("");
  const [giornoF, setGiornoF] = useState("1");
  const [attivo, setAttivo] = useState(false);
  const salva = useScrivi(() => api("/economia/canoni", { method: "POST", json: { clientId, amountCents: centesimi(importo), billingDay: Number(giornoF), attivo } }), "Canone salvato", onChiudi);
  const giornoOk = /^\d{1,2}$/.test(giornoF) && Number(giornoF) >= 1 && Number(giornoF) <= 28;
  const manca = !clientId ? "Scegli il cliente" : centesimi(importo) == null ? "Scrivi l'importo al mese" : !giornoOk ? "Giorno di fatturazione da 1 a 28" : undefined;
  return (
    <Foglio aperto titolo="Nuovo canone" onChiudi={onChiudi} principale={<Principale testo="Salva il canone" manca={manca} inCorso={salva.isPending} onClick={() => salva.mutate()} />}>
      <Selettore etichetta="Cliente" opzioni={opzioniClienti(clienti.data ?? [], true)} valore={clientId} onCambia={setClientId} apertoAllInizio />
      <Campo etichetta="Importo al mese, in euro" inputMode="decimal" value={importo} onChange={(e) => setImporto(e.target.value)} />
      <Campo etichetta="Giorno di fatturazione" inputMode="numeric" value={giornoF} onChange={(e) => setGiornoF(e.target.value)} />
      <Interruttore etichetta="Già attivo da oggi" aiuto="Spento, il canone resta in attesa di attivazione" acceso={attivo} onCambia={setAttivo} />
    </Foglio>
  );
}

export function FoglioNuovaFattura({ onChiudi }: { onChiudi: () => void }) {
  const clienti = useClienti();
  const [clientId, setClientId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoFattura>("canone");
  const [importo, setImporto] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [numero, setNumero] = useState("");
  const [emessa, setEmessa] = useState("");
  const [pdf, setPdf] = useState("");
  const salva = useScrivi(
    () => api("/economia/fatture", { method: "POST", json: { clientId, kind: tipo, amountCents: centesimi(importo), period: periodo, number: numero, issuedAt: emessa ? daIsoGiorno(emessa) : null, pdfUrl: pdf.trim() || null } }),
    "Fattura salvata",
    onChiudi,
  );
  const manca = !clientId ? "Scegli il cliente" : centesimi(importo) == null ? "Scrivi l'importo" : emessa && !numero.trim() ? "Una fattura emessa ha il suo numero" : undefined;
  return (
    <Foglio aperto titolo="Nuova fattura" onChiudi={onChiudi} principale={<Principale testo="Salva la fattura" manca={manca} inCorso={salva.isPending} onClick={() => salva.mutate()} />}>
      <Selettore etichetta="Cliente" opzioni={opzioniClienti(clienti.data ?? [], true)} valore={clientId} onCambia={setClientId} apertoAllInizio />
      <Selettore etichetta="Tipo" opzioni={TIPI} valore={tipo} onCambia={setTipo} />
      <Campo etichetta="Importo, in euro" inputMode="decimal" value={importo} onChange={(e) => setImporto(e.target.value)} />
      <Campo etichetta="Periodo" aiuto="Per esempio: novembre 2026" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
      <Campo etichetta="Emessa il" aiuto="Vuota se la fattura è ancora da emettere" type="date" value={emessa} onChange={(e) => setEmessa(e.target.value)} />
      {emessa && <Campo etichetta="Numero della fattura" aiuto="Quello del programma di fatturazione" value={numero} onChange={(e) => setNumero(e.target.value)} />}
      <Campo etichetta="Link al PDF, facoltativo" type="url" value={pdf} onChange={(e) => setPdf(e.target.value)} />
    </Foglio>
  );
}

export function FoglioNuovoCosto({ onChiudi, ora = Date.now() }: { onChiudi: () => void; ora?: number }) {
  const clienti = useClienti();
  const automazioni = useAutomazioni();
  const [data, setData] = useState(isoGiorno(ora));
  const [categoria, setCategoria] = useState<Categoria>("strumenti");
  const [importo, setImporto] = useState("");
  const [cliente, setCliente] = useState(NESSUNO);
  const [automazione, setAutomazione] = useState(NESSUNO);
  const [nota, setNota] = useState("");
  const salva = useScrivi(
    () => api("/economia/costi", { method: "POST", json: { date: daIsoGiorno(data), category: categoria, amountCents: centesimi(importo), clientId: cliente === NESSUNO ? null : cliente, automationId: automazione === NESSUNO ? null : automazione, note: nota } }),
    "Costo salvato",
    onChiudi,
  );
  const manca = daIsoGiorno(data) == null ? "Scegli la data" : centesimi(importo) == null ? "Scrivi l'importo" : undefined;
  const nessuno = { valore: NESSUNO, etichetta: "Nessuno" };
  return (
    <Foglio aperto titolo="Nuovo costo" onChiudi={onChiudi} principale={<Principale testo="Salva il costo" manca={manca} inCorso={salva.isPending} onClick={() => salva.mutate()} />}>
      <Campo etichetta="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
      <Selettore etichetta="Categoria" opzioni={CATEGORIE} valore={categoria} onCambia={setCategoria} />
      <Campo etichetta="Importo, in euro" inputMode="decimal" value={importo} onChange={(e) => setImporto(e.target.value)} />
      <Campo etichetta="Nota" aiuto="Per esempio: abbonamento Make di novembre" value={nota} onChange={(e) => setNota(e.target.value)} />
      <Selettore etichetta="Cliente, facoltativo" opzioni={[nessuno, ...opzioniClienti(clienti.data ?? [], false)]} valore={cliente} onCambia={setCliente} />
      <Selettore etichetta="Automazione, facoltativa" opzioni={[nessuno, ...(automazioni.data?.automazioni ?? []).map((a) => ({ valore: a.id, etichetta: a.name, meta: a.cliente }))]} valore={automazione} onCambia={setAutomazione} />
    </Foglio>
  );
}

// Spec 9.3: dalla fattura da emettere si chiede il numero; da quella emessa o in ritardo, la data di incasso.
export function FoglioFattura({ f, ora = Date.now(), onChiudi }: { f: FatturaRiga; ora?: number; onChiudi: () => void }) {
  const [numero, setNumero] = useState(f.number ?? "");
  const [data, setData] = useState(isoGiorno(ora));
  const daEmettere = f.stato === "da_emettere";
  const azione = useScrivi(
    () => daEmettere
      ? api(`/economia/fatture/${f.id}/emessa`, { method: "POST", json: { number: numero.trim(), issuedAt: daIsoGiorno(data) } })
      : api(`/economia/fatture/${f.id}/incassata`, { method: "POST", json: { paidAt: daIsoGiorno(data) } }),
    daEmettere ? "Fattura segnata come emessa" : "Fattura segnata come incassata",
    onChiudi,
  );
  const manca = daIsoGiorno(data) == null ? "Scegli la data" : daEmettere && !numero.trim() ? "Scrivi il numero della fattura" : undefined;
  const principale = f.stato === "incassata" ? undefined : <Principale testo={daEmettere ? "Segna emessa" : "Segna incassata"} manca={manca} inCorso={azione.isPending} onClick={() => azione.mutate()} />;
  return (
    <Foglio aperto titolo={`${ETICHETTE_TIPO_FATTURA[f.kind]} di ${f.cliente}`} onChiudi={onChiudi} principale={principale}>
      <p className="font-display text-titolo-card tabular-nums">{euro(f.amountCents)}</p>
      {f.number && <p className="text-corpo">{`Numero ${f.number}`}</p>}
      {f.period && <p className="text-corpo">{`Periodo: ${f.period}`}</p>}
      {f.issuedAt != null && <p className="text-corpo">{`Emessa ${ilGiorno(f.issuedAt, ora)}`}</p>}
      {f.dueAt != null && <p className={f.stato === "in_ritardo" ? "text-corpo text-errore" : "text-corpo"}>{`${f.stato === "in_ritardo" ? "Scaduta" : "Scade"} ${ilGiorno(f.dueAt, ora)}`}</p>}
      {f.paidAt != null && <p className="text-corpo">{`Incassata ${ilGiorno(f.paidAt, ora)}`}</p>}
      {f.pdfUrl && <a href={f.pdfUrl} target="_blank" rel="noreferrer" className="min-h-11 text-corpo font-semibold text-accento underline-offset-4 hover:underline">Apri il PDF</a>}
      {daEmettere && <Campo etichetta="Numero della fattura" aiuto="Quello del programma di fatturazione" value={numero} onChange={(e) => setNumero(e.target.value)} />}
      {f.stato !== "incassata" && <Campo etichetta={daEmettere ? "Emessa il" : "Incassata il"} type="date" value={data} onChange={(e) => setData(e.target.value)} />}
    </Foglio>
  );
}

const AZIONI: Record<CanoneRiga["status"], { azione: AzioneCanone; etichetta: string }[]> = {
  in_attesa: [{ azione: "attiva", etichetta: "Attiva il canone" }, { azione: "cessa", etichetta: "Cessa il canone" }],
  attivo: [{ azione: "pausa", etichetta: "Metti in pausa il canone" }, { azione: "cessa", etichetta: "Cessa il canone" }],
  in_pausa: [{ azione: "riprendi", etichetta: "Riprendi il canone" }, { azione: "cessa", etichetta: "Cessa il canone" }],
  cessato: [],
};
const CONSEGUENZA: Record<AzioneCanone, string> = {
  attiva: "Da oggi conta nel ricorrente.",
  pausa: "Da oggi esce dal ricorrente, finché non lo riprendi.",
  riprendi: "Da oggi torna nel ricorrente.",
  cessa: "Esce dal ricorrente e va tra i cessati. Non si torna indietro.",
};

// Spec 9.2: ogni azione sul canone passa da un foglio di conferma (mai confirm() del browser).
export function FoglioCanone({ c, ora = Date.now(), onChiudi }: { c: CanoneRiga; ora?: number; onChiudi: () => void }) {
  const [scelta, setScelta] = useState<(typeof AZIONI)[CanoneRiga["status"]][number] | null>(null);
  const salva = useScrivi(() => api(`/economia/canoni/${c.id}/stato`, { method: "POST", json: { azione: scelta?.azione } }), "Canone aggiornato", onChiudi);
  if (scelta) {
    return (
      <Foglio aperto titolo={scelta.etichetta} onChiudi={onChiudi}
        principale={<Pulsante variante={scelta.azione === "cessa" ? "distruttivo" : "primario"} misura="lg" className="w-full" inCorso={salva.isPending} onClick={() => salva.mutate()}>{scelta.etichetta}</Pulsante>}>
        <p className="text-corpo font-semibold">{c.cliente}</p>
        <p className="text-corpo tabular-nums">{`${euro(c.amountCents)} al mese`}</p>
        <p className="text-secondaria text-grigio">{CONSEGUENZA[scelta.azione]}</p>
        <Pulsante variante="fantasma" className="self-start" onClick={() => setScelta(null)}>Torna al canone</Pulsante>
      </Foglio>
    );
  }
  return (
    <Foglio aperto titolo={`Canone di ${c.cliente}`} onChiudi={onChiudi}>
      <p className="font-display text-titolo-card tabular-nums">{`${euro(c.amountCents)} al mese`}</p>
      <p className="text-corpo">{`Fatturazione il giorno ${c.billingDay}`}</p>
      <p className="text-corpo">{`Stato: ${ETICHETTE_CANONE[c.status]}`}</p>
      {c.startAt != null && <p className="text-meta text-grigio">{`Attivo ${ilGiorno(c.startAt, ora, "dal")}`}</p>}
      {c.pausedAt != null && <p className="text-meta text-grigio">{`In pausa ${ilGiorno(c.pausedAt, ora, "dal")}`}</p>}
      {c.endAt != null && <p className="text-meta text-grigio">{`Cessato ${ilGiorno(c.endAt, ora)}`}</p>}
      <div className="flex flex-wrap gap-2">
        {AZIONI[c.status].map((a) => (
          <Pulsante key={a.azione} variante={a.azione === "cessa" ? "fantasma" : "secondario"} onClick={() => setScelta(a)}>{a.etichetta}</Pulsante>
        ))}
      </div>
    </Foglio>
  );
}
