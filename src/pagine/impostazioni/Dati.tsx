import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api";
import { Foglio, Intestazione, Riga } from "../../ds";
import { momento } from "../../format";
import type { RiepilogoDati } from "../../types";

const ESPORTAZIONI: [string, string][] = [["leads", "Scarica i lead"], ["proposte", "Scarica le proposte"], ["fatture", "Scarica le fatture"]];

// Spec 11.6 e prototipo 33. Elenco di voci: nessun pulsante pieno.
export function Dati() {
  const q = useQuery({ queryKey: ["dati", "riepilogo"], queryFn: () => api<RiepilogoDati>("/dati/riepilogo") });
  const [esporta, setEsporta] = useState(false);
  const [demo, setDemo] = useState(false);
  const r = q.data;
  const cestino = !r ? undefined : r.cestino === 0 ? "Vuoto" : `${r.cestino} lead: restano lì finché non li ripristini`;
  return (
    <div className="grid gap-6 p-4 pb-28 md:px-0 md:pt-0">
      <Intestazione eyebrow="Impostazioni" titolo="Dati" />
      <ul className="grid grid-cols-1 gap-2 @5xl:grid-cols-2 @7xl:grid-cols-3">
        <li><Riga titolo="Cestino" secondaria={cestino} href="/impostazioni/dati/cestino" /></li>
        <li><Riga titolo="Importa lead da CSV" secondaria="Con anteprima e controllo dei doppioni" href="/impostazioni/dati/importa" /></li>
        <li><Riga titolo="Esporta" secondaria="Lead, proposte, fatture in CSV" onClick={() => setEsporta(true)} /></li>
        <li><Riga titolo="Registro delle modifiche" secondaria={r?.ultimaModifica ? `Ultima voce ${momento(r.ultimaModifica)}` : r ? "Nessuna voce" : undefined} href="/impostazioni/dati/registro" /></li>
        <li><Riga titolo="Spazio demo" secondaria="Dati finti per le presentazioni" onClick={() => setDemo(true)} /></li>
      </ul>
      <Foglio aperto={esporta} titolo="Esporta in CSV" onChiudi={() => setEsporta(false)}><CorpoEsporta /></Foglio>
      <Foglio aperto={demo} titolo="Spazio demo" onChiudi={() => setDemo(false)}>
        <p className="text-testo">È una copia dell'app con dati finti, per le presentazioni ai clienti. Non tocca mai i lead veri e non manda email, notifiche o messaggi.</p>
        {r?.demoUrl
          ? <a className="text-testo font-semibold underline underline-offset-4" href={r.demoUrl} target="_blank" rel="noopener noreferrer">Apri lo spazio demo</a>
          : <p className="text-nota text-grigio">L'indirizzo arriva quando lo spazio demo è pubblicato.</p>}
        <p className="text-nota text-grigio">Si entra con l'utente demo. I dati tornano come all'inizio ogni volta che chi gestisce il server rilancia il ripristino.</p>
      </Foglio>
    </div>
  );
}

// Corpo del foglio Esporta, a parte per il test. Voce 60: una riga spiega l'apostrofo davanti ai "+39".
export function CorpoEsporta() {
  return (
    <>
      <ul className="grid grid-cols-1 gap-1">
        {ESPORTAZIONI.map(([k, t]) => <li key={k}><a className="flex min-h-11 items-center text-testo font-semibold underline-offset-4 hover:underline" href={`/api/export/${k}`} download>{t}</a></li>)}
      </ul>
      <p className="text-nota text-grigio">Il file si apre con Excel o Google Fogli. Ogni scaricamento finisce nel registro.</p>
      <p className="text-nota text-grigio">Davanti ai telefoni come +39 trovi un apostrofo: protegge il foglio dalle formule, il numero resta giusto.</p>
    </>
  );
}
