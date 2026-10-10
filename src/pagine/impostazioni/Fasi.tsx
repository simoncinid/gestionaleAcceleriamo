import { CaretRight } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Campo, CampoQuando, Errore, Foglio, Interruttore, Intestazione, Pulsante, Selettore, SelettoreMultiplo, Skeleton, type Opzione } from "../../ds";
import { useStages, useUsers } from "../../hooks";
import type { Impostazioni, Stage } from "../../types";
import { centesimi } from "../commerciale/scheda";
import { Aggiungi, Sezione, useImpostazioni } from "./parti";
import { RiordinaFasi } from "./RiordinaFasi";
import { CAMPI_REGOLE, ETICHETTE_REGOLE, ETICHETTE_TIPO, bozzaDi, corpoRegole, opzioniAggancio, sintesiDellaFase, type BozzaRegola, type RegolaLetta } from "./regole";

const GIORNI: [number, string][] = [[1, "Lunedì"], [2, "Martedì"], [3, "Mercoledì"], [4, "Giovedì"], [5, "Venerdì"], [6, "Sabato"], [0, "Domenica"]];
const OPZIONI_GIORNI: Opzione<string>[] = GIORNI.map(([n, nome]) => ({ valore: String(n), etichetta: nome }));
// Riga chiusa: i giorni scelti in breve e nell'ordine della settimana ("lun, mar, mer, gio, ven").
const giorniInBreve = (giorni: number[]) => GIORNI.filter(([n]) => giorni.includes(n)).map(([, nome]) => nome.slice(0, 3).toLowerCase()).join(", ");
type Operatore = Impostazioni["punteggio"][number]["operatore"];
const OPERATORI: Opzione<Operatore>[] = [
  { valore: "contiene", etichetta: "contiene" },
  { valore: "non_contiene", etichetta: "non contiene" },
  { valore: "presente", etichetta: "è compilato" },
];
type Bozza = Pick<Impostazioni, "orario" | "punteggio" | "motivi" | "assegnazione"> & { setup: string; ore: string; moltiplicatore: string };

export const useRegole = () => useQuery({ queryKey: ["stage-rules"], queryFn: () => api<{ rules: RegolaLetta[] }>("/stage-rules").then((r) => r.rules) });

// QA 11 (prototipo 29): elenco in sola lettura, una riga per fase con nome, scadenze e azione proposta,
// un'informazione per riga e niente testo tagliato. Toccando la riga si apre il foglio di quella fase.
// L'ordine si cambia con "Riordina" (foglio RiordinaFasi).
// La fase aperta sta nel genitore: col foglio aperto il "Salva le regole" della pagina si nasconde,
// così l'unica azione in accento è "Salva la fase".
function ListaFasi({ fasi, regole, aperta, setAperta }: { fasi: Stage[]; regole: RegolaLetta[]; aperta: Stage | null; setAperta: (f: Stage | null) => void }) {
  return (
    <>
      <ul className="divide-y divide-sabbia overflow-hidden rounded-blocco border border-sabbia bg-avorio">
        {fasi.map((f) => {
          const scadenze = sintesiDellaFase(regole, f.id);
          return (
            <li key={f.id}>
              <button type="button" data-fase={f.id} onClick={() => setAperta(f)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-(--durata-veloce) hover:bg-crema">
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="break-words text-corpo font-semibold">{f.label}</span>
                  {scadenze.length
                    ? scadenze.map((t) => <span key={t} className="break-words text-secondaria text-grigio">{t}</span>)
                    : <span className="text-secondaria text-grigio">Nessuna scadenza</span>}
                  <span className="break-words text-secondaria text-grigio">{f.suggestedNextAction ? `Azione proposta: ${f.suggestedNextAction}` : "Nessuna azione proposta"}</span>
                </span>
                <CaretRight size={18} weight="bold" aria-hidden className="shrink-0 text-grigio" />
              </button>
            </li>
          );
        })}
      </ul>
      {aperta && <FoglioFase key={aperta.id} fase={aperta} onChiudi={() => setAperta(null)} />}
    </>
  );
}

// Il modulo di una sola fase: nome, probabilità, azione proposta. "Salva la fase" è l'unica azione del foglio;
// senza modifiche resta spento (niente "Fase salvata" quando non è cambiato nulla).
export function FoglioFase({ fase, onChiudi }: { fase: Stage; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(fase.label);
  const [probabilita, setProbabilita] = useState(String(fase.probability));
  const [azione, setAzione] = useState(fase.suggestedNextAction ?? "");
  const salva = useMutation({
    mutationFn: () => {
      const r = campiFase(fase, { nome, probabilita, azione });
      if ("errore" in r) throw new Error(r.errore);
      return Object.keys(r.campi).length ? api(`/stages/${fase.id}`, { method: "PATCH", json: r.campi }) : Promise.resolve(null);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["stages"] }); toast.success("Fase salvata"); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  const prova = campiFase(fase, { nome, probabilita, azione });
  const nienteDaSalvare = "campi" in prova && Object.keys(prova.campi).length === 0;
  return (
    <Foglio aperto titolo={fase.label} onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={nienteDaSalvare ? "Non hai cambiato nulla" : undefined} onClick={() => salva.mutate()}>Salva la fase</Pulsante>}>
      <p className="text-secondaria text-grigio">{`Fase ${ETICHETTE_TIPO[fase.kind]}`}</p>
      <Campo etichetta="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      <Campo etichetta="Probabilità, in percentuale" inputMode="numeric" value={probabilita} onChange={(e) => setProbabilita(e.target.value)} />
      <Campo etichetta="Azione proposta" value={azione} onChange={(e) => setAzione(e.target.value)} />
    </Foglio>
  );
}

// Solo i campi cambiati vanno nella PATCH; il primo errore ferma il salvataggio con una frase in italiano.
export function campiFase(f: Pick<Stage, "label" | "probability" | "suggestedNextAction">, v: { nome: string; probabilita: string; azione: string }): { campi: Record<string, unknown> } | { errore: string } {
  const nome = v.nome.trim();
  const azione = v.azione.trim();
  const n = Number(v.probabilita.trim());
  if (!nome) return { errore: "La fase ha bisogno di un nome" };
  if (!v.probabilita.trim() || !Number.isInteger(n) || n < 0 || n > 100) return { errore: "Probabilità: un numero da 0 a 100" };
  const campi: Record<string, unknown> = {};
  if (nome !== f.label) campi.label = nome;
  if (n !== f.probability) campi.probability = n;
  if (azione !== (f.suggestedNextAction ?? "")) campi.suggestedNextAction = azione || null;
  return { campi };
}

function ModuloRegole({ fasi, regole, imp, utenti }: { fasi: Stage[]; regole: RegolaLetta[]; imp: Impostazioni; utenti: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [bozze, setBozze] = useState<BozzaRegola[]>(() => regole.map(bozzaDi));
  const [b, setB] = useState<Bozza>(() => ({
    orario: imp.orario, punteggio: imp.punteggio, motivi: imp.motivi, assegnazione: imp.assegnazione,
    setup: String(imp.prezzi.setupCents / 100), ore: String(imp.prezzi.ore), moltiplicatore: String(imp.prezzi.moltiplicatore),
  }));
  const [faseAperta, setFaseAperta] = useState<Stage | null>(null);
  const [riordina, setRiordina] = useState(false);
  const persone: Opzione<string>[] = utenti.map((u) => ({ valore: u.id, etichetta: u.name }));
  const regola = (id: string, campi: Partial<BozzaRegola>) => setBozze((x) => x.map((r) => (r.id === id ? { ...r, ...campi } : r)));
  const assegna = (campi: Partial<Impostazioni["assegnazione"]>) => setB({ ...b, assegnazione: { ...b.assegnazione, ...campi } });
  const salva = useMutation({
    mutationFn: async () => {
      const corpo = corpoRegole(bozze);
      if ("errore" in corpo) throw new Error(corpo.errore);
      const setupCents = centesimi(b.setup);
      const ore = Number(b.ore);
      const moltiplicatore = Number(b.moltiplicatore.replace(",", "."));
      if (setupCents == null) throw new Error("Setup standard: scrivi un importo in euro");
      if (!Number.isInteger(ore) || ore < 0) throw new Error("Ore standard: un numero intero");
      if (!(moltiplicatore >= 5 && moltiplicatore <= 10)) throw new Error("Moltiplicatore della proprietà: da 5 a 10");
      if (!b.orario.giorni.length) throw new Error("Orario di lavoro: scegli almeno un giorno");
      if (b.motivi.some((m) => !m.etichetta.trim())) throw new Error("Ogni motivo di scarto ha bisogno di un nome");
      if (b.punteggio.some((p) => !p.campo.trim())) throw new Error("Ogni regola di punteggio ha bisogno del campo del lead");
      await api("/stage-rules", { method: "PUT", json: corpo });
      const valori: [keyof Impostazioni, unknown][] = [
        ["orario", b.orario],
        ["punteggio", b.punteggio],
        ["motivi", b.motivi.map((m) => ({ ...m, etichetta: m.etichetta.trim() }))],
        ["assegnazione", b.assegnazione],
        ["prezzi", { setupCents, ore, moltiplicatore }],
      ];
      for (const [key, value] of valori) await api("/settings", { method: "PUT", json: { key, value } });
    },
    onSuccess: () => {
      toast.success("Regole salvate: valgono dal prossimo evento");
      for (const k of [["stage-rules"], ["settings"]]) qc.invalidateQueries({ queryKey: k });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mx-auto grid max-w-[720px] gap-8 p-4 pb-28">
      <Intestazione eyebrow="Impostazioni" titolo="Fasi e regole" />
      <Sezione titolo="Fasi">
        <p className="text-secondaria text-grigio">Tocca una fase per cambiarne nome, probabilità o azione proposta.</p>
        <ListaFasi fasi={fasi} regole={regole} aperta={faseAperta} setAperta={setFaseAperta} />
        <div><Pulsante variante="secondario" onClick={() => setRiordina(true)}>Riordina</Pulsante></div>
        {riordina && <RiordinaFasi fasi={fasi} onChiudi={() => setRiordina(false)} />}
      </Sezione>

      <Sezione titolo="Regole">
        <p className="text-secondaria text-grigio">Una regola cambiata vale dal prossimo evento: i lead già in sequenza non si ricalcolano.</p>
        <ul className="grid gap-3">
          {bozze.map((r) => (
            <li key={r.id} className="grid gap-2 rounded-card bg-avorio p-3">
              <p className="text-corpo font-semibold">{ETICHETTE_REGOLE[r.ruleKey]}</p>
              <Selettore etichetta="Si aggancia a" opzioni={opzioniAggancio(fasi)} valore={r.aggancio} onCambia={(v) => regola(r.id, { aggancio: v })} />
              {CAMPI_REGOLE[r.ruleKey].map((c) => (
                <Campo key={c.chiave} etichetta={c.etichetta} inputMode={c.lista ? "text" : "numeric"} value={r.valori[c.chiave] ?? ""}
                  onChange={(e) => regola(r.id, { valori: { ...r.valori, [c.chiave]: e.target.value } })} />
              ))}
              <Interruttore etichetta="Regola attiva" acceso={r.active} onCambia={(v) => regola(r.id, { active: v })} />
            </li>
          ))}
        </ul>
      </Sezione>

      <Sezione titolo="Orario di lavoro">
        <SelettoreMultiplo etichetta="Giorni di lavoro" opzioni={OPZIONI_GIORNI} valori={b.orario.giorni.map(String)} testoValore={giorniInBreve(b.orario.giorni)}
          onCambia={(v) => setB({ ...b, orario: { ...b.orario, giorni: v.map(Number) } })} />
        <div className="grid grid-cols-2 gap-3">
          <Campo etichetta="Inizio" type="time" value={b.orario.inizio} onChange={(e) => setB({ ...b, orario: { ...b.orario, inizio: e.target.value } })} />
          <Campo etichetta="Fine" type="time" value={b.orario.fine} onChange={(e) => setB({ ...b, orario: { ...b.orario, fine: e.target.value } })} />
        </div>
      </Sezione>

      <Sezione titolo="Punteggio">
        <ul className="grid gap-3">
          {b.punteggio.map((p, i) => {
            const cambia = (campi: Partial<typeof p>) => setB({ ...b, punteggio: b.punteggio.map((x, j) => (j === i ? { ...x, ...campi } : x)) });
            return (
              <li key={`${i}:${b.punteggio.length}`} className="grid gap-2 rounded-card bg-avorio p-3">
                <Campo etichetta="Campo del lead" value={p.campo} onChange={(e) => cambia({ campo: e.target.value })} />
                <Selettore etichetta="Condizione" opzioni={OPERATORI} valore={p.operatore} onCambia={(v) => cambia({ operatore: v })} />
                {p.operatore !== "presente" && <Campo etichetta="Valore" value={p.valore} onChange={(e) => cambia({ valore: e.target.value })} />}
                <Campo etichetta="Punti, da -5 a 5" type="number" min={-5} max={5} defaultValue={p.punti}
                  onBlur={(e) => cambia({ punti: Math.max(-5, Math.min(5, Math.trunc(Number(e.target.value) || 0))) })} />
                <Pulsante variante="fantasma" className="justify-self-start" onClick={() => setB({ ...b, punteggio: b.punteggio.filter((_, j) => j !== i) })}>Togli la regola</Pulsante>
              </li>
            );
          })}
        </ul>
        <Aggiungi onClick={() => setB({ ...b, punteggio: [...b.punteggio, { campo: "", operatore: "contiene", valore: "", punti: 1 }] })}>Aggiungi una regola di punteggio</Aggiungi>
      </Sezione>

      <Sezione titolo="Motivi di scarto">
        <ul className="grid gap-2">
          {b.motivi.map((m, i) => (
            <li key={m.id} className="flex items-end gap-2">
              <div className="flex-1">
                <Campo etichetta={`Motivo ${i + 1}`} value={m.etichetta} onChange={(e) => setB({ ...b, motivi: b.motivi.map((x, j) => (j === i ? { ...x, etichetta: e.target.value } : x)) })} />
              </div>
              <Pulsante variante="fantasma" motivoSpento={b.motivi.length === 1 ? "Serve almeno un motivo" : undefined} onClick={() => setB({ ...b, motivi: b.motivi.filter((_, j) => j !== i) })}>Togli</Pulsante>
            </li>
          ))}
        </ul>
        <Aggiungi onClick={() => setB({ ...b, motivi: [...b.motivi, { id: `motivo_${Date.now().toString(36)}`, etichetta: "" }] })}>Aggiungi un motivo</Aggiungi>
      </Sezione>

      <Sezione titolo="Assegnazione">
        <Selettore etichetta="Prima chiamata" opzioni={persone} valore={b.assegnazione.primaChiamata} onCambia={(v) => assegna({ primaChiamata: v })} />
        <Selettore etichetta="Call di presentazione" opzioni={persone} valore={b.assegnazione.presentazione} onCambia={(v) => assegna({ presentazione: v })} />
        <Selettore etichetta="Proposta" opzioni={persone} valore={b.assegnazione.proposta} onCambia={(v) => assegna({ proposta: v })} />
        <Selettore etichetta="Chi è via" opzioni={[{ valore: "nessuno", etichetta: "Nessuno" }, ...persone]} valore={b.assegnazione.via.utente ?? "nessuno"}
          onCambia={(v) => assegna({ via: v === "nessuno" ? { utente: null, fino: null } : { utente: v, fino: b.assegnazione.via.fino } })} />
        {b.assegnazione.via.utente && (
          <CampoQuando etichetta="Via fino a" valore={b.assegnazione.via.fino} onCambia={(ms) => assegna({ via: { ...b.assegnazione.via, fino: ms } })} />
        )}
      </Sezione>

      <Sezione titolo="Prezzi di riferimento">
        <Campo etichetta="Setup standard, in euro" inputMode="decimal" value={b.setup} onChange={(e) => setB({ ...b, setup: e.target.value })} />
        <Campo etichetta="Ore standard" inputMode="numeric" value={b.ore} onChange={(e) => setB({ ...b, ore: e.target.value })} />
        <Campo etichetta="Moltiplicatore della proprietà, da 5 a 10" inputMode="decimal" value={b.moltiplicatore} onChange={(e) => setB({ ...b, moltiplicatore: e.target.value })} />
      </Sezione>

      {!faseAperta && !riordina && (
        <div className="sticky bottom-20 md:bottom-4">
          <Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} onClick={() => salva.mutate()}>Salva le regole</Pulsante>
        </div>
      )}
    </div>
  );
}

export function Fasi() {
  const fasi = useStages();
  const regole = useRegole();
  const imp = useImpostazioni();
  const utenti = useUsers();
  if (fasi.isLoading || regole.isLoading || imp.isLoading || utenti.isLoading) return <div className="mx-auto max-w-[720px] p-4"><Skeleton righe={10} /></div>;
  const errore = fasi.error ?? regole.error ?? imp.error ?? utenti.error;
  if (errore) return <div className="mx-auto max-w-[720px] p-4"><Errore errore={errore} onRiprova={() => { void fasi.refetch(); void regole.refetch(); void imp.refetch(); void utenti.refetch(); }} /></div>;
  return <ModuloRegole fasi={fasi.data!} regole={regole.data!} imp={imp.data!} utenti={utenti.data!} />;
}
