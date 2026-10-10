import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router";
import { toast } from "sonner";
import { api } from "../../api";
import { mostraErrore } from "../../errori";
import { Errore, Intestazione, Pulsante, Punto, Skeleton } from "../../ds";
import { euroCentesimi, momento } from "../../format";
import type { Integrazione, StatoSistema } from "../../types";
import { ScollegaTelegram } from "./Profilo";
import { SezioneAggancio, SezioneFoglio, SezioneResend } from "./integrazioni-sezioni";
import { COLORE, ETICHETTA_STATO, rigaStato, useImpostazioni, useProfilo, useStatoSistema } from "./parti";
import { EVENTI_TELEGRAM, LinkTelegram, useTelegram } from "./Profilo";

type UsoClaude = { collegato: boolean; spesoCents: number; tettoCents: number; avvisoCents: number; fermi: number; perTipo: { tipo: string; lavori: number; costoCents: number }[]; modelli: Record<string, string> };
type Dispositivo = { id: string; etichetta: string; lastOkAt: number | null; rotta: boolean };
const NOMI_LAVORI: Record<string, string> = { classificazione: "Classificazione", scheda: "Scheda azienda", coach: "Coach della call", commento: "Commento del lunedì" };

const Testo = ({ children }: { children: ReactNode }) => <p className="text-corpo">{children}</p>;
const Nota = ({ children }: { children: ReactNode }) => <p className="text-secondaria text-grigio">{children}</p>;

// Le prove sono secondarie (come nella 1A): nel dettaglio nessun pulsante pieno.
function Prova({ percorso, testo, fatto }: { percorso: string; testo: string; fatto: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api(percorso, { method: "POST" }),
    onSuccess: () => { toast.success(fatto); void qc.invalidateQueries({ queryKey: ["integrazioni"] }); },
    onError: (e) => mostraErrore(e),
  });
  return <div><Pulsante variante="secondario" inCorso={m.isPending} onClick={() => m.mutate()}>{testo}</Pulsante></div>;
}

function Meta({ d, i }: { d: StatoSistema; i: Integrazione }) {
  if (i.stato === "spento") return <Testo>Mancano i segreti dell'app di Meta: li mette chi gestisce il server. Finché mancano, i lead dei moduli non arrivano qui.</Testo>;
  return (
    <>
      <Testo>{`Lead da Meta negli ultimi 7 giorni: ${d.settimana.meta}`}</Testo>
      <Nota>Se da 48 ore non arriva nessun lead, controlla campagne e modulo in Gestione inserzioni.</Nota>
      <Nota>Per una prova usa lo strumento di test dei lead di Meta (developers.facebook.com/tools/lead-ads-testing): il lead finto arriva in Scaletta in pochi secondi.</Nota>
    </>
  );
}

function Push({ i }: { i: Integrazione }) {
  const disp = useQuery({ queryKey: ["push-dispositivi"], queryFn: () => api<{ dispositivi: Dispositivo[] }>("/push-subscriptions"), enabled: i.stato !== "spento" });
  if (i.stato === "spento") return <Testo>Mancano le chiavi per le notifiche: le mette chi gestisce il server. Finché mancano, gli avvisi restano dentro l'app.</Testo>;
  return (
    <>
      <h3 className="text-corpo font-semibold">I tuoi dispositivi</h3>
      {disp.isLoading ? <Skeleton righe={2} /> : disp.data?.dispositivi.length ? (
        <ul className="grid grid-cols-1 gap-1">
          {disp.data.dispositivi.map((x) => (
            <li key={x.id} className="grid">
              <span className="text-corpo">{x.etichetta}</span>
              <span className="text-meta text-grigio">{x.rotta ? "Non raggiungibile" : x.lastOkAt ? `Ultima notifica ${momento(x.lastOkAt)}` : "Nessuna notifica ancora"}</span>
            </li>
          ))}
        </ul>
      ) : <Nota>Nessun dispositivo: le notifiche si attivano da Utenti e profilo, su ogni telefono o computer.</Nota>}
      <Prova percorso="/integrations/push/prova" testo="Manda una notifica di prova" fatto="Notifica di prova partita: arriva sui tuoi dispositivi" />
    </>
  );
}

function Telegram({ i }: { i: Integrazione }) {
  const profilo = useProfilo();
  const { link, collega, scollega } = useTelegram();
  if (i.stato === "spento") return <Testo>Manca il bot di Telegram: lo collega chi gestisce il server. Quando c'è, ognuno collega la sua chat da qui o da Utenti e profilo.</Testo>;
  const mia = profilo.data?.telegram ?? false;
  return (
    <>
      <Testo>{`Telegram manda solo tre avvisi: ${EVENTI_TELEGRAM}.`}</Testo>
      <Testo>{mia ? "La tua chat è collegata." : "La tua chat non è collegata."}</Testo>
      {!mia && link && <LinkTelegram link={link} />}
      <div className="flex flex-wrap gap-2">
        {mia ? (
          <>
            <Prova percorso="/integrations/telegram/prova" testo="Manda un messaggio di prova" fatto="Messaggio di prova mandato sulla tua chat" />
            <ScollegaTelegram scollega={scollega} testo="Scollega la tua chat" />
          </>
        ) : (
          <Pulsante variante="secondario" inCorso={collega.isPending} onClick={() => collega.mutate()}>{link ? "Chiedi un codice nuovo" : "Collega la tua chat"}</Pulsante>
        )}
      </div>
    </>
  );
}

function Claude({ i }: { i: Integrazione }) {
  const u = useQuery({ queryKey: ["claude", "uso"], queryFn: () => api<UsoClaude>("/claude/usage"), enabled: i.stato !== "spento" });
  if (i.stato === "spento") return <Testo>Manca la chiave di Anthropic: la mette chi gestisce il server. Finché manca, i lavori di Claude restano in coda e non si spende niente.</Testo>;
  if (u.isLoading) return <Skeleton righe={4} />;
  if (u.error || !u.data) return <Errore errore={u.error} onRiprova={() => void u.refetch()} />;
  const d = u.data;
  return (
    <>
      <Testo>{`Speso questo mese: ${euroCentesimi(d.spesoCents)} su ${euroCentesimi(d.tettoCents)}`}</Testo>
      <Nota>{`Avviso a ${euroCentesimi(d.avvisoCents)}; al tetto i lavori si fermano fino al primo del mese.`}</Nota>
      {d.fermi > 0 && <Testo>{`${d.fermi} ${d.fermi === 1 ? "lavoro fermo" : "lavori fermi"} per il tetto: ripartono il primo del mese`}</Testo>}
      <ul className="grid grid-cols-1 gap-2">
        {Object.entries(d.modelli).map(([k, m]) => {
          const t = d.perTipo.find((x) => x.tipo === k);
          return (
            <li key={k} className="grid">
              <span className="text-corpo">{NOMI_LAVORI[k] ?? k}</span>
              <span className="text-meta text-grigio">{`${m}, ${t?.lavori ?? 0} lavori, ${euroCentesimi(t?.costoCents ?? 0)}`}</span>
            </li>
          );
        })}
      </ul>
      <Nota>Nessuna prova da qui: ogni chiamata costa. Modelli e tetto li cambia chi gestisce il server.</Nota>
    </>
  );
}

// Spec 11.5 e prototipo 32: stato, configurazione e prova di una sola integrazione.
export function IntegrazioneDettaglio({ ora = Date.now() }: { ora?: number } = {}) {
  const { key = "" } = useParams();
  const s = useStatoSistema();
  const imp = useImpostazioni();
  if (s.isLoading || imp.isLoading) return <div className="mx-auto max-w-[720px] p-4"><Skeleton righe={8} /></div>;
  const errore = s.error ?? imp.error;
  if (errore || !s.data || !imp.data) return <div className="mx-auto max-w-[720px] p-4"><Errore errore={errore} onRiprova={() => { void s.refetch(); void imp.refetch(); }} /></div>;
  const i = s.data.integrazioni.find((x) => x.key === key);
  if (!i || key === "giro") return <Navigate to="/impostazioni/integrazioni" replace />;
  const d = s.data;
  return (
    <div className="mx-auto grid max-w-[720px] gap-6 p-4 pb-28">
      <Intestazione eyebrow="Integrazioni" titolo={i.etichetta} />
      <div className="grid gap-1">
        <p className="flex items-center gap-2 text-corpo"><Punto colore={COLORE[i.stato]} etichetta={ETICHETTA_STATO[i.stato]} />{ETICHETTA_STATO[i.stato]}</p>
        <p className="text-secondaria text-grigio">{rigaStato(i, ora)}</p>
        {i.stato === "errore" && i.ultimaOk != null && <p className="text-meta text-grigio">{`Ultima volta riuscita ${momento(i.ultimaOk, ora)}`}</p>}
      </div>
      <div className="grid gap-3 rounded-blocco border border-sabbia bg-avorio p-4">
        {key === "meta" && <Meta d={d} i={i} />}
        {key === "foglio" && <SezioneFoglio d={d} foglio={imp.data.foglio} ora={ora} />}
        {key === "aggancio" && <SezioneAggancio d={d} ora={ora} />}
        {key === "resend" && <SezioneResend d={d} conferma={imp.data.conferma} />}
        {key === "push" && <Push i={i} />}
        {key === "telegram" && <Telegram i={i} />}
        {key === "claude" && <Claude i={i} />}
      </div>
    </div>
  );
}
