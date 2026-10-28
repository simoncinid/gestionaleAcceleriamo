import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Intestazione, Pulsante, Riga } from "../../ds";
import { messaggioImportInterrotto } from "../../errori";
import type { AnteprimaImport } from "../../types";

const BLOCCO = 20; // come il server: 20 righe per richiesta restano sotto le 50 query
const MOSTRATE = 200;
const ESITO = { nuovo: "Nuovo", gia_presente: "Già presente", senza_contatti: "Senza contatti", errore: "Errore" } as const;
const errore = (e: Error) => toast.error(e.message);

// Spec 11.6: prima l'anteprima con i doppioni, poi l'import dei soli nuovi a blocchi.
export function ImportaCsv() {
  const qc = useQueryClient();
  const [anteprima, setAnteprima] = useState<AnteprimaImport | null>(null);
  const [fatti, setFatti] = useState(0);
  const entrati = useRef(0); // righe dei blocchi riusciti: il toast di errore legge il conteggio vero, non quello del render
  const righeDelFile = useRef<number[]>([]);
  const file = useRef("CSV"); // nome del file, per lo storico "Importato da <file>"
  const leggi = useMutation({
    mutationFn: async (f: File) => { file.current = f.name; return api<AnteprimaImport>("/import/leads?anteprima=1", { method: "POST", json: { csv: await f.text(), file: f.name } }); },
    onSuccess: (a) => { setAnteprima(a); setFatti(0); },
    onError: errore,
  });
  const importa = useMutation({
    mutationFn: async () => {
      // I già presenti vanno al server con gli altri: lì si segna "Arrivato di nuovo" sul lead che c'è già.
      const nuove = anteprima!.righe.filter((r) => r.esito !== "errore");
      let creati = 0;
      entrati.current = 0;
      righeDelFile.current = nuove.map((r) => r.riga);
      for (let i = 0; i < nuove.length; i += BLOCCO) {
        const r = await api<{ creati: number }>("/import/leads", { method: "POST", json: { righe: nuove.slice(i, i + BLOCCO), file: file.current } });
        creati += r.creati;
        entrati.current = Math.min(i + BLOCCO, nuove.length);
        setFatti(creati);
      }
      return creati;
    },
    onSuccess: (n) => { toast.success(n ? `${n} lead importati: li trovi tra i lead` : "Già presenti segnati nello storico"); setAnteprima(null); void qc.invalidateQueries({ queryKey: ["leads"] }); },
    // Un blocco fallito lascia importati quelli prima: il toast dice fino a quale riga del file (voce 59), rileggere il file li segna come doppioni.
    onError: (e) => { toast.error(messaggioImportInterrotto(e.message, righeDelFile.current, entrati.current)); void qc.invalidateQueries({ queryKey: ["leads"] }); },
  });
  const daImportare = anteprima ? anteprima.nuovi + anteprima.senzaContatti : 0;
  return (
    // Sul largo: a sinistra istruzioni, file e riepilogo; a destra l'anteprima delle righe e il pulsante.
    // Sul telefono i due blocchi si sciolgono ("contents"): stesso ordine di prima.
    <div className="grid items-start gap-6 p-4 pb-28 md:px-0 md:pt-0 @5xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @5xl:gap-x-8">
      <div className="@5xl:col-span-full"><Intestazione eyebrow="Dati" titolo="Importa lead da CSV" /></div>
      <div className="contents @5xl:grid @5xl:gap-6">
        <div className="grid gap-2">
          <p className="text-corpo">Serve una riga di intestazione con la colonna Azienda (va bene anche Ragione sociale).</p>
          <p className="text-secondaria text-grigio">Colonne riconosciute: Referente, Email, Telefono, Sito, Note.</p>
          <p className="text-secondaria text-grigio">I lead importati non ricevono l'email di conferma.</p>
        </div>
        <label className="grid gap-2 text-corpo">
          <span className="font-medium">File CSV</span>
          <input type="file" accept=".csv,text/csv" disabled={leggi.isPending || importa.isPending}
            className="text-secondaria file:mr-3 file:min-h-11 file:rounded-controllo file:border file:border-sabbia file:bg-avorio file:px-4 file:font-semibold"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) leggi.mutate(f); }} />
        </label>
        {leggi.isPending && <p className="text-secondaria text-grigio">Lettura del file</p>}
        {anteprima && (
          <div className="grid gap-1">
            <p className="text-corpo">{`${anteprima.nuovi} nuovi, ${anteprima.giaPresenti} già presenti, ${anteprima.senzaContatti} senza contatti${anteprima.errori ? `, ${anteprima.errori} con errori` : ""}`}</p>
            <p className="text-secondaria text-grigio">I già presenti non diventano lead nuovi: sul lead che c'è già compare "Arrivato di nuovo".</p>
            <p className="text-secondaria text-grigio">Quelli senza telefono né email entrano in Non profilato, con una nota.</p>
          </div>
        )}
      </div>
      {anteprima && (
        <div className="contents @5xl:grid @5xl:gap-6">
          {/* Il motivo sta nella riga meta, che va a capo: nella secondaria si troncava (QA Task 15). */}
          <ul className="grid grid-cols-1 gap-2 @7xl:grid-cols-2">
            {anteprima.righe.slice(0, MOSTRATE).map((r) => (
              <li key={r.riga}><Riga peso="normale" titolo={r.company || `Riga ${r.riga}`} secondaria={ESITO[r.esito]} meta={r.motivo ?? undefined} /></li>
            ))}
          </ul>
          {anteprima.righe.length > MOSTRATE && <p className="text-secondaria text-grigio">{`Mostrate le prime ${MOSTRATE} righe di ${anteprima.righe.length}.`}</p>}
          <div>
            <Pulsante variante="primario" inCorso={importa.isPending} motivoSpento={daImportare + anteprima.giaPresenti === 0 ? "Nessuna riga da importare nel file" : undefined} onClick={() => importa.mutate()}>
              {importa.isPending ? `Importati ${fatti} di ${daImportare}` : daImportare ? `Importa ${daImportare} lead` : `Segna ${anteprima.giaPresenti} già presenti`}
            </Pulsante>
          </div>
        </div>
      )}
    </div>
  );
}
