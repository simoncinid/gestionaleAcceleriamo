import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Campo, CampoQuando, Errore, Intestazione, Pulsante, Selettore, SelettoreMultiplo, Skeleton, type Opzione } from "../../ds";
import { useStages, useUsers } from "../../hooks";
import type { Impostazioni, Stage } from "../../types";
import { centesimi } from "../commerciale/scheda";
import { Aggiungi, Sezione, useImpostazioni } from "./parti";

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

// Blocco 1, modifica 4: le regole delle nove fasi sono fisse (worker/processo, contratto sezione 2) e qui si leggono soltanto.
type RegolaFase = { id: string; nome: string; azione: string; scadenza: string; chi: "primaChiamata" | "presentazione" | null };
export const REGOLE_FASI: RegolaFase[] = [
  { id: "da-chiamare-prima-volta", nome: "Nuovo, da chiamare", azione: "Prima chiamata", scadenza: "30 minuti dall'arrivo, dentro l'orario di lavoro", chi: "primaChiamata" },
  { id: "da-richiamare", nome: "Da richiamare", azione: "Richiamare (tentativo n di 5)", scadenza: "Il passo dopo dei tentativi, o il giorno detto dal cliente. Dopo il quinto a vuoto: pausa di 2 mesi e un'ultima chiamata", chi: "primaChiamata" },
  { id: "appuntamento-confermato", nome: "Consulenza fissata", azione: "Fare la consulenza", scadenza: "Data e ora della call. Se non si presenta: rifissare entro 2 ore lavorative; alla seconda assenza pausa di 2 mesi", chi: "primaChiamata" },
  { id: "in-attesa-preventivo", nome: "In attesa preventivo", azione: "Preparare il preventivo", scadenza: "Il giorno lavorativo prima della presentazione; senza data, 2 giorni lavorativi dopo la consulenza", chi: "presentazione" },
  { id: "presentazione-confermata", nome: "Presentazione fissata", azione: "Presentare il preventivo", scadenza: "Data e ora della call. Se non si presenta: come la consulenza", chi: "presentazione" },
  { id: "in-attesa-decisione", nome: "In attesa decisione", azione: "Sentire il cliente per la decisione", scadenza: "Il giorno dopo la data detta dal cliente, altrimenti 3 giorni dopo la presentazione; poi a 7 e 14 giorni, pausa di 2 mesi", chi: "presentazione" },
  { id: "chiuso", nome: "Cliente", azione: "Avviare il lavoro dalla pagina cliente", scadenza: "Nessuna: esce dai lead aperti", chi: "presentazione" },
  { id: "non-chiuso", nome: "Non interessato", azione: "Nessuna, si può riaprire", scadenza: "Nessuna. Il motivo è obbligatorio", chi: null },
  { id: "fake", nome: "Non profilato", azione: "Nessuna, si può riaprire", scadenza: "Nessuna", chi: null },
];

// Una riga per fase, un'informazione per riga, niente da toccare.
function ListaFasi({ fasi, chi }: { fasi: Stage[]; chi: (r: RegolaFase["chi"]) => string }) {
  return (
    <ul className="divide-y divide-sabbia overflow-hidden rounded-blocco border border-sabbia bg-avorio">
      {REGOLE_FASI.map((r) => (
        <li key={r.id} data-fase={r.id} className="grid gap-0.5 px-4 py-3">
          <span className="break-words text-corpo font-semibold">{fasi.find((f) => f.id === r.id)?.label ?? r.nome}</span>
          <span className="break-words text-secondaria text-grigio">{`Azione: ${r.azione}`}</span>
          <span className="break-words text-secondaria text-grigio">{`Scadenza: ${r.scadenza}`}</span>
          <span className="break-words text-secondaria text-grigio">{`Chi: ${chi(r.chi)}`}</span>
        </li>
      ))}
    </ul>
  );
}

function ModuloRegole({ fasi, imp, utenti }: { fasi: Stage[]; imp: Impostazioni; utenti: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [b, setB] = useState<Bozza>(() => ({
    orario: imp.orario, punteggio: imp.punteggio, motivi: imp.motivi, assegnazione: imp.assegnazione,
    setup: String(imp.prezzi.setupCents / 100), ore: String(imp.prezzi.ore), moltiplicatore: String(imp.prezzi.moltiplicatore),
  }));
  const persone: Opzione<string>[] = utenti.map((u) => ({ valore: u.id, etichetta: u.name }));
  // Impostazioni salva l'id o il nome utente ("diego"): si mostra il nome della persona.
  const nomeDi = (chi: string) => utenti.find((u) => u.id === chi || u.name.toLowerCase().startsWith(chi.toLowerCase()))?.name ?? chi.charAt(0).toUpperCase() + chi.slice(1);
  const chi = (r: RegolaFase["chi"]) => (r ? nomeDi(imp.assegnazione[r]) : "nessuno");
  const assegna = (campi: Partial<Impostazioni["assegnazione"]>) => setB({ ...b, assegnazione: { ...b.assegnazione, ...campi } });
  const salva = useMutation({
    mutationFn: async () => {
      const setupCents = centesimi(b.setup);
      const ore = Number(b.ore);
      const moltiplicatore = Number(b.moltiplicatore.replace(",", "."));
      if (setupCents == null) throw new Error("Setup standard: scrivi un importo in euro");
      if (!Number.isInteger(ore) || ore < 0) throw new Error("Ore standard: un numero intero");
      if (!(moltiplicatore >= 5 && moltiplicatore <= 10)) throw new Error("Moltiplicatore della proprietà: da 5 a 10");
      if (!b.orario.giorni.length) throw new Error("Orario di lavoro: scegli almeno un giorno");
      if (b.motivi.some((m) => !m.etichetta.trim())) throw new Error("Ogni motivo di scarto ha bisogno di un nome");
      if (b.punteggio.some((p) => !p.campo.trim())) throw new Error("Ogni regola di punteggio ha bisogno del campo del lead");
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
      toast.success("Impostazioni salvate");
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    // Sul largo le sezioni scorrono in due colonne (CSS columns): l'ordine nel codice resta quello del telefono,
    // quindi lettura e tasto Tab seguono lo stesso percorso. Sul telefono il contenitore si scioglie ("contents").
    <div className="grid gap-8 p-4 pb-28 md:px-0 md:pt-0">
      <Intestazione eyebrow="Impostazioni" titolo="Fasi e regole" />
      <div className="contents @5xl:block @5xl:columns-2 @5xl:gap-8 @5xl:*:mb-8 @5xl:*:break-inside-avoid">
      <Sezione titolo="Fasi">
        <p className="text-secondaria text-grigio">Le regole delle fasi sono fisse: azione, scadenza e chi le decide il processo di vendita.</p>
        <ListaFasi fasi={fasi} chi={chi} />
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
        <ul className="grid grid-cols-1 gap-3">
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
        <p className="text-secondaria text-grigio">L'elenco è fisso, così i Numeri li contano; puoi cambiare solo i nomi.</p>
        <ul className="grid grid-cols-1 gap-2">
          {b.motivi.map((m, i) => (
            <li key={m.id}>
              <Campo etichetta={`Motivo ${i + 1}`} value={m.etichetta} onChange={(e) => setB({ ...b, motivi: b.motivi.map((x, j) => (j === i ? { ...x, etichetta: e.target.value } : x)) })} />
            </li>
          ))}
        </ul>
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

      </div>
      <div className="sticky bottom-20 -mx-4 bg-crema px-4 py-3 md:bottom-4 @5xl:flex @5xl:justify-end">
          <Pulsante variante="primario" misura="lg" className="w-full @5xl:w-auto @5xl:min-w-72" inCorso={salva.isPending} onClick={() => salva.mutate()}>Salva le impostazioni</Pulsante>
      </div>
    </div>
  );
}

export function Fasi() {
  const fasi = useStages();
  const imp = useImpostazioni();
  const utenti = useUsers();
  if (fasi.isLoading || imp.isLoading || utenti.isLoading) return <div className="p-4 md:px-0 md:pt-0"><Skeleton righe={10} /></div>;
  const errore = fasi.error ?? imp.error ?? utenti.error;
  if (errore) return <div className="p-4 md:px-0 md:pt-0"><Errore errore={errore} onRiprova={() => { void fasi.refetch(); void imp.refetch(); void utenti.refetch(); }} /></div>;
  return <ModuloRegole fasi={fasi.data!} imp={imp.data!} utenti={utenti.data!} />;
}
