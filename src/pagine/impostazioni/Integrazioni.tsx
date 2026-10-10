import { Errore, Intestazione, Punto, Riga, Skeleton } from "../../ds";
import { COLORE, ETICHETTA_STATO, rigaStato, useStatoSistema } from "./parti";

// Voci senza pagina: non sono collegamenti, dicono solo come stanno.
const ALTRE = [
  { key: "r2", etichetta: "R2 e Drive", nota: "Non attivo: i documenti sono link" },
  { key: "calendar", etichetta: "Google Calendar", nota: "In arrivo con il passaggio a cliente" },
];

// Spec 11.5 e prototipo 32: elenco (pallino, nome, una riga di stato); ogni voce apre la sua pagina con stato, configurazione e prova.
// Il giro programmato sta in Stato del sistema, non qui. Sola lettura: nessun pulsante pieno.
export function Integrazioni({ ora = Date.now() }: { ora?: number } = {}) {
  const s = useStatoSistema();
  if (s.isLoading) return <div className="mx-auto max-w-[720px] p-4"><Skeleton righe={8} /></div>;
  if (s.error || !s.data) return <div className="mx-auto max-w-[720px] p-4"><Errore errore={s.error} onRiprova={() => void s.refetch()} /></div>;
  const voci = s.data.integrazioni.filter((i) => i.key !== "giro");
  const attive = voci.filter((i) => i.stato === "ok" || i.stato === "errore").length;
  return (
    <div className="mx-auto grid max-w-[720px] gap-6 p-4 pb-28">
      <Intestazione eyebrow="Impostazioni" titolo="Integrazioni" numero={attive || undefined} coda={attive === 1 ? "attiva" : "attive"} />
      <ul className="grid grid-cols-1 gap-2">
        {voci.map((i) => (
          <li key={i.key} id={i.key}>
            <Riga titolo={i.etichetta} href={`/impostazioni/integrazioni/${i.key}`}
              secondaria={<span className="inline-flex items-center gap-2"><Punto colore={COLORE[i.stato]} etichetta={ETICHETTA_STATO[i.stato]} />{rigaStato(i, ora)}</span>} />
          </li>
        ))}
        {ALTRE.map((a) => <li key={a.key}><Riga titolo={a.etichetta} secondaria={a.nota} /></li>)}
      </ul>
    </div>
  );
}
