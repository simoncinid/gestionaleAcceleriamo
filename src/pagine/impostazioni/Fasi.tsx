import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Campo, CampoQuando, Errore, Intestazione, Pulsante, Selettore, Skeleton, type Opzione } from "../../ds";
import { useStages, useUsers } from "../../hooks";
import type { Impostazioni, Stage } from "../../types";
import { centesimi } from "../commerciale/scheda";
import { Aggiungi, Sezione, useImpostazioni } from "./parti";
import { CAMPI_REGOLE, ETICHETTE_REGOLE, ETICHETTE_TIPO, bozzaDi, corpoRegole, opzioniAggancio, type BozzaRegola, type RegolaLetta } from "./regole";

const GIORNI: [number, string][] = [[1, "Lunedì"], [2, "Martedì"], [3, "Mercoledì"], [4, "Giovedì"], [5, "Venerdì"], [6, "Sabato"], [0, "Domenica"]];
type Operatore = Impostazioni["punteggio"][number]["operatore"];
const OPERATORI: Opzione<Operatore>[] = [
  { valore: "contiene", etichetta: "contiene" },
  { valore: "non_contiene", etichetta: "non contiene" },
  { valore: "presente", etichetta: "è compilato" },
];
type Bozza = Pick<Impostazioni, "orario" | "punteggio" | "motivi" | "assegnazione"> & { setup: string; ore: string; moltiplicatore: string };

export const useRegole = () => useQuery({ queryKey: ["stage-rules"], queryFn: () => api<{ rules: RegolaLetta[] }>("/stage-rules").then((r) => r.rules) });

// Le fasi salvano al blur, come nella 1A (spec 11.2).
function ListaFasi({ fasi }: { fasi: Stage[] }) {
  const qc = useQueryClient();
  const [giro, setGiro] = useState(0);
  const ricarica = () => qc.invalidateQueries({ queryKey: ["stages"] });
  const patch = useMutation({
    mutationFn: ({ id, campi }: { id: string; campi: Record<string, unknown> }) => api(`/stages/${id}`, { method: "PATCH", json: campi }),
    onSuccess: () => { ricarica(); toast.success("Fase salvata"); },
    onError: (e) => { setGiro((n) => n + 1); toast.error(e.message); },
  });
  const ordine = useMutation({
    mutationFn: (ids: string[]) => api("/stages/order", { method: "PUT", json: { ids } }),
    onSuccess: ricarica,
    onError: (e) => toast.error(e.message),
  });
  const sposta = (i: number, d: number) => {
    const ids = fasi.map((f) => f.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    ordine.mutate(ids);
  };
  const alBlur = (f: Stage, campo: "label" | "probability" | "suggestedNextAction", testo: string) => {
    const v = testo.trim();
    const prima = campo === "probability" ? String(f.probability) : (f[campo] ?? "");
    if (v === prima) return;
    if (campo === "label" && !v) { setGiro((n) => n + 1); return toast.error("La fase ha bisogno di un nome"); }
    if (campo === "probability") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 100) { setGiro((x) => x + 1); return toast.error("Probabilità: un numero da 0 a 100"); }
      return patch.mutate({ id: f.id, campi: { probability: n } });
    }
    patch.mutate({ id: f.id, campi: { [campo]: campo === "suggestedNextAction" ? v || null : v } });
  };
  return (
    <ul className="grid gap-3">
      {fasi.map((f, i) => (
        <li key={`${f.id}:${f.label}:${f.probability}:${f.suggestedNextAction}:${giro}`} className="grid gap-2 rounded-card bg-avorio p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-meta text-grigio">{`Fase ${i + 1}, ${ETICHETTE_TIPO[f.kind]}`}</p>
            <div className="flex gap-2">
              <Pulsante variante="icona" misura="sm" aria-label={`Sposta su: ${f.label}`} motivoSpento={i === 0 ? "È già la prima" : undefined} inCorso={ordine.isPending} onClick={() => sposta(i, -1)} icona={<ArrowUp size={18} weight="bold" aria-hidden />} />
              <Pulsante variante="icona" misura="sm" aria-label={`Sposta giù: ${f.label}`} motivoSpento={i === fasi.length - 1 ? "È già l'ultima" : undefined} inCorso={ordine.isPending} onClick={() => sposta(i, 1)} icona={<ArrowDown size={18} weight="bold" aria-hidden />} />
            </div>
          </div>
          <Campo etichetta="Nome" defaultValue={f.label} onBlur={(e) => alBlur(f, "label", e.target.value)} />
          <Campo etichetta="Probabilità, in percentuale" inputMode="numeric" defaultValue={String(f.probability)} onBlur={(e) => alBlur(f, "probability", e.target.value)} />
          <Campo etichetta="Azione proposta" defaultValue={f.suggestedNextAction ?? ""} onBlur={(e) => alBlur(f, "suggestedNextAction", e.target.value)} />
        </li>
      ))}
    </ul>
  );
}

function ModuloRegole({ fasi, regole, imp, utenti }: { fasi: Stage[]; regole: RegolaLetta[]; imp: Impostazioni; utenti: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [bozze, setBozze] = useState<BozzaRegola[]>(() => regole.map(bozzaDi));
  const [b, setB] = useState<Bozza>(() => ({
    orario: imp.orario, punteggio: imp.punteggio, motivi: imp.motivi, assegnazione: imp.assegnazione,
    setup: String(imp.prezzi.setupCents / 100), ore: String(imp.prezzi.ore), moltiplicatore: String(imp.prezzi.moltiplicatore),
  }));
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
        <p className="text-secondaria text-grigio">Nome, probabilità e azione proposta si salvano quando esci dal campo.</p>
        <ListaFasi fasi={fasi} />
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
              <label className="flex min-h-11 items-center gap-3 text-corpo">
                <input type="checkbox" className="size-5 accent-accento" checked={r.active} onChange={(e) => regola(r.id, { active: e.target.checked })} />
                Regola attiva
              </label>
            </li>
          ))}
        </ul>
      </Sezione>

      <Sezione titolo="Orario di lavoro">
        <fieldset className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          <legend className="sr-only">Giorni di lavoro</legend>
          {GIORNI.map(([n, nome]) => (
            <label key={n} className="flex min-h-11 items-center gap-3 text-corpo">
              <input type="checkbox" className="size-5 accent-accento" checked={b.orario.giorni.includes(n)}
                onChange={(e) => setB({ ...b, orario: { ...b.orario, giorni: e.target.checked ? [...b.orario.giorni, n] : b.orario.giorni.filter((g) => g !== n) } })} />
              {nome}
            </label>
          ))}
        </fieldset>
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

      <div className="sticky bottom-20 md:bottom-4">
        <Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} onClick={() => salva.mutate()}>Salva le regole</Pulsante>
      </div>
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
