import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { Errore, Intestazione, Pulsante, Punto, Riga, Skeleton } from "../../ds";
import { momento } from "../../format";
import { COLORE, ETICHETTA_STATO, Sezione, conGiroInRitardo, rigaStato, useStatoSistema } from "./parti";

// Avvisi sta già in testa con il conteggio: qui non si ripete.
const VOCI = [
  { titolo: "Utenti e profilo", href: "/impostazioni/utenti" },
  { titolo: "Fasi e regole", href: "/impostazioni/fasi" },
  { titolo: "Modelli", href: "/impostazioni/modelli" },
  { titolo: "Integrazioni", href: "/impostazioni/integrazioni" },
  { titolo: "Dati", href: "/impostazioni/dati" },
];

// Spec 11.1: "funziona tutto?". Nessun pulsante pieno: ogni semaforo rosso porta alla sua integrazione.
export function Stato({ ora = Date.now(), onEsci }: { ora?: number; onEsci: () => void }) {
  const s = useStatoSistema();
  // Stessa chiave della pagina Avvisi: aprendola dopo, l'elenco è già in cache.
  const avvisi = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ avvisi: unknown[]; nonLetti: number }>("/notifications") });
  if (s.isLoading) return <div className="mx-auto max-w-[720px] p-4"><Skeleton righe={8} /></div>;
  if (s.error) return <div className="mx-auto max-w-[720px] p-4"><Errore errore={s.error} onRiprova={() => void s.refetch()} /></div>;
  const d = { ...s.data!, integrazioni: conGiroInRitardo(s.data!.integrazioni, ora) };
  const rossi = d.integrazioni.filter((i) => i.stato === "errore").length;
  return (
    <div className="mx-auto grid max-w-[720px] gap-8 p-4 pb-28">
      <Intestazione eyebrow="Impostazioni" titolo="Stato del sistema" />
      <Riga titolo={avvisi.data?.avvisi.length ? `Avvisi (${avvisi.data.avvisi.length})` : "Avvisi"} href="/impostazioni/avvisi" />
      <Sezione titolo="Collegamenti" coda={rossi ? `${rossi} da controllare` : undefined}>
        <ul className="grid gap-2">
          {d.integrazioni.map((i) => (
            <li key={i.key}>
              <Riga
                titolo={i.etichetta}
                href={i.stato === "errore" && i.key !== "giro" ? `/impostazioni/integrazioni/${i.key}` : undefined}
                secondaria={<span className="inline-flex items-center gap-2"><Punto colore={COLORE[i.stato]} etichetta={ETICHETTA_STATO[i.stato]} />{rigaStato(i, ora)}</span>}
                meta={i.stato === "errore" && i.ultimaOk != null ? `Ultima volta ${momento(i.ultimaOk, ora)}` : undefined}
              />
            </li>
          ))}
        </ul>
      </Sezione>
      <Sezione titolo="Ultimi 7 giorni">
        <div className="grid gap-1 rounded-blocco border border-sabbia bg-avorio px-4 py-3">
          <p className="text-corpo"><strong className="tabular-nums">{d.settimana.meta}</strong> lead dal webhook Meta</p>
          <p className="text-corpo"><strong className="tabular-nums">{d.settimana.foglio}</strong> lead dal Foglio Andrea</p>
          <p className="text-corpo"><strong className="tabular-nums">{d.settimana.aggancio}</strong> proposte dall'aggancio</p>
        </div>
      </Sezione>
      {d.errori.length > 0 && (
        <Sezione titolo="Ultimi errori">
          <ul className="grid gap-2">
            {d.errori.map((e) => (
              <li key={e.key}>
                <Riga titolo={e.etichetta} secondaria={e.errore}
                  meta={<><span className="block">{momento(e.at, ora)}</span>{e.errorId && <span className="block">{`Codice ${e.errorId}`}</span>}</>} />
              </li>
            ))}
          </ul>
        </Sezione>
      )}
      <Sezione titolo="Configurazione">
        <ul className="grid gap-2">{VOCI.map((v) => <li key={v.href}><Riga titolo={v.titolo} href={v.href} /></li>)}</ul>
        <Pulsante variante="fantasma" className="justify-self-start" onClick={onEsci}>Esci dall'account</Pulsante>
      </Sezione>
    </div>
  );
}
