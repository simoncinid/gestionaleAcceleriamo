import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { CampagnaRisponditore } from "../../../worker/risponditore/routes";
import { api } from "../../api";
import { Campo, Errore, Foglio, Intestazione, Pulsante, Punto, Riga, Skeleton, StatoVuoto } from "../../ds";
import { momento, telefonoMostrato } from "../../format";
import { useOra } from "../../hooks";
import { Sezione } from "../impostazioni/parti";
import { FoglioCampagna, type RisorsaBreve } from "./RisponditoreCampagna";

type StatoEvento = "in_corso" | "inviato" | "link_inviato" | "ignorato" | "errore";
export type EventoRisponditore = {
  commentoId: string; mediaId: string; autoreNome: string | null; testo: string; campagnaId: string | null;
  parola: string | null; stato: StatoEvento; motivo: string | null; creatoIl: number; piattaforma?: "ig" | "fb";
};
export type RichiestaChiamata = { id: string; nome: string; azienda: string; telefono: string; slug: string; risorsa: string | null; creataIl: number };
export type DatiRisponditore = {
  account: { username: string; scadeIl: number; ultimoErrore: string | null } | null;
  campagne: CampagnaRisponditore[];
  eventi: EventoRisponditore[];
  richieste: RichiestaChiamata[];
  risorse: RisorsaBreve[];
};

export const useRisponditore = () => useQuery({ queryKey: ["risponditore"], queryFn: () => api<DatiRisponditore>("/risponditore") });

export const STATI_EVENTO: Record<StatoEvento, { etichetta: string; colore: "verde" | "giallo" | "grigio" | "rosso" }> = {
  inviato: { etichetta: "Inviato", colore: "verde" },
  link_inviato: { etichetta: "Link mandato", colore: "verde" },
  ignorato: { etichetta: "Ignorato", colore: "grigio" },
  errore: { etichetta: "Errore", colore: "rosso" },
  in_corso: { etichetta: "In corso", colore: "giallo" },
};

const GIORNO = 86_400_000;
const PRIMI_EVENTI = 30;

function giorniAlRinnovo(scadeIl: number, ora: number) {
  const giorni = Math.ceil((scadeIl - ora) / GIORNO);
  return giorni === 1 ? "Rinnovo tra 1 giorno" : `Rinnovo tra ${giorni} giorni`;
}

// Stato dell'account in alto: chi è collegato, quando si rinnova il token, l'ultimo errore. Il token non arriva mai qui.
function Account({ account, ora, onCollega }: { account: DatiRisponditore["account"]; ora: number; onCollega: () => void }) {
  return (
    <Sezione titolo="Account Instagram">
      <div className="grid gap-1 rounded-blocco border border-sabbia bg-avorio p-5">
        {account ? (
          <>
            <p className="flex items-center gap-2 text-testo font-semibold">
              <Punto colore={account.ultimoErrore || account.scadeIl <= ora ? "rosso" : "verde"} etichetta={account.ultimoErrore ? "Con errore" : account.scadeIl <= ora ? "Token scaduto" : "Collegato"} />
              {account.scadeIl <= ora ? `Token scaduto per @${account.username}` : `Collegato come @${account.username}`}
            </p>
            <p className="text-nota text-grigio tabular-nums">{account.scadeIl <= ora ? "Token scaduto: collegalo di nuovo" : giorniAlRinnovo(account.scadeIl, ora)}</p>
            {account.ultimoErrore && <p className="text-nota text-errore">{`Ultimo errore: ${account.ultimoErrore}`}</p>}
          </>
        ) : (
          <>
            <p className="text-testo font-semibold">Nessun account collegato</p>
            <p className="text-nota text-grigio">Senza account i commenti non ricevono risposta.</p>
          </>
        )}
        <Pulsante variante="secondario" className="mt-3 justify-self-start" onClick={onCollega}>{account ? "Cambia il token" : "Collega l'account"}</Pulsante>
      </div>
    </Sezione>
  );
}

function FoglioAccount({ onChiudi }: { onChiudi: () => void }) {
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const collega = useMutation({
    mutationFn: () => api<{ account: { username: string } }>("/risponditore/account", { method: "POST", json: { token: token.trim() } }),
    onSuccess: ({ account }) => { toast.success(`Collegato come @${account.username}`); void qc.invalidateQueries({ queryKey: ["risponditore"] }); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Foglio aperto titolo="Account Instagram" onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={collega.isPending} motivoSpento={token.trim() ? undefined : "Incolla il token"} onClick={() => collega.mutate()}>Collega l'account</Pulsante>}>
      <p className="text-testo">Incolla il token dell'account Instagram professionale. Lo controllo con Instagram e lo salvo cifrato: dopo non si legge più.</p>
      <Campo etichetta="Token di Instagram" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
    </Foglio>
  );
}

function Campagne({ campagne, onApri, onNuova }: { campagne: CampagnaRisponditore[]; onApri: (c: CampagnaRisponditore) => void; onNuova: () => void }) {
  const attive = campagne.filter((c) => c.attiva).length;
  return (
    <Sezione titolo="Campagne" coda={campagne.length ? (attive === 1 ? "1 attiva" : `${attive} attive`) : undefined}>
      {campagne.length === 0
        ? <StatoVuoto titolo="Nessuna campagna" testo="Una campagna dice quale parola cercare nei commenti e quale risorsa mandare." />
        : (
          <ul className="grid gap-2">
            {campagne.map((c) => (
              <li key={c.id}>
                <Riga titolo={c.nome} onClick={() => onApri(c)}
                  secondaria={`Parola: ${c.parola}`}
                  meta={c.mediaId ? `Post ${c.mediaId}` : "Tutti i post"}
                  destra={<span className="flex shrink-0 items-center gap-2 text-nota"><Punto colore={c.attiva ? "verde" : "grigio"} etichetta={c.attiva ? "Attiva" : "Spenta"} />{c.attiva ? "Attiva" : "Spenta"}</span>} />
              </li>
            ))}
          </ul>
        )}
      <Pulsante variante="primario" misura="lg" className="w-full sm:w-auto sm:justify-self-start" onClick={onNuova}>Nuova campagna</Pulsante>
    </Sezione>
  );
}

function Richieste({ richieste, ora }: { richieste: RichiestaChiamata[]; ora: number }) {
  return (
    <Sezione titolo="Richieste di chiamata" coda={richieste.length ? String(richieste.length) : undefined}>
      {richieste.length === 0
        ? <StatoVuoto titolo="Nessuna richiesta di chiamata" testo="Arrivano dal modulo delle pagine risorsa." />
        : (
          <ul className="grid gap-2">
            {richieste.map((r) => (
              <li key={r.id} className="grid gap-0.5 rounded-blocco border border-sabbia bg-avorio px-4 py-3">
                <p className="text-testo font-semibold">{r.nome}</p>
                <p className="text-nota">{r.azienda}</p>
                <p className="text-nota tabular-nums"><a href={`tel:${r.telefono.replace(/[^\d+]/g, "")}`} className="underline-offset-4 hover:underline">{telefonoMostrato(r.telefono)}</a></p>
                <p className="text-nota text-grigio">{`Dalla risorsa: ${r.risorsa ?? r.slug}`}</p>
                <p className="text-nota text-grigio tabular-nums">{momento(r.creataIl, ora)}</p>
              </li>
            ))}
          </ul>
        )}
    </Sezione>
  );
}

// Registro degli invii: una riga per commento letto, con l'esito in parole e il motivo quando c'è.
function Registro({ eventi, ora }: { eventi: EventoRisponditore[]; ora: number }) {
  const [tutti, setTutti] = useState(false);
  const visibili = tutti ? eventi : eventi.slice(0, PRIMI_EVENTI);
  return (
    <Sezione titolo="Registro degli invii" coda={eventi.length ? (eventi.length === 1 ? "1 commento" : `${eventi.length} commenti`) : undefined}>
      {eventi.length === 0
        ? <StatoVuoto titolo="Nessun commento ancora" testo="Qui compare ogni commento letto, con quello che è partito." />
        : (
          <>
            <ul className="grid gap-2">
              {visibili.map((e) => {
                const s = STATI_EVENTO[e.stato];
                return (
                  <li key={e.commentoId} className="grid gap-0.5 rounded-blocco border border-sabbia bg-avorio px-4 py-3">
                    <p className="text-testo font-semibold">{e.autoreNome ? (e.piattaforma === "fb" ? e.autoreNome : `@${e.autoreNome}`) : "Autore senza nome"}</p>
                    <p className="line-clamp-2 text-nota">{e.testo}</p>
                    <p className="text-nota text-grigio">{`${e.piattaforma === "fb" ? "Facebook" : "Instagram"} · ${e.parola ? `Parola: ${e.parola}` : "Nessuna campagna"}`}</p>
                    <p className="flex items-center gap-2 text-nota font-medium"><Punto colore={s.colore} etichetta={s.etichetta} />{s.etichetta}</p>
                    {e.motivo && <p className="text-nota text-grigio">{e.motivo}</p>}
                    <p className="text-nota text-grigio tabular-nums">{momento(e.creatoIl, ora)}</p>
                  </li>
                );
              })}
            </ul>
            {!tutti && eventi.length > PRIMI_EVENTI && (
              <Pulsante variante="fantasma" className="justify-self-start" onClick={() => setTutti(true)}>{`Mostra gli altri ${eventi.length - PRIMI_EVENTI}`}</Pulsante>
            )}
          </>
        )}
    </Sezione>
  );
}

type Aperto = null | "account" | "nuova" | CampagnaRisponditore;

// Una sola azione piena: la nuova campagna, sotto l'elenco delle campagne. Collegare l'account resta secondario.
export function Risponditore({ ora: oraFissa }: { ora?: number } = {}) {
  const ora = useOra(60_000, oraFissa);
  const q = useRisponditore();
  const [aperto, setAperto] = useState<Aperto>(null);
  const testata = <Intestazione titolo="Risponditore" eyebrow="Commenti di Instagram" />;
  if (q.isLoading) return <div className="grid gap-6 p-4 md:px-0">{testata}<Skeleton righe={6} /></div>;
  if (q.error) return <div className="grid gap-6 p-4 md:px-0">{testata}<Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const d = q.data!;
  return (
    <div className="grid gap-8 p-4 pb-12 md:px-0">
      {testata}
      {/* Sul computer largo: account e campagne a sinistra, richieste e registro a destra (in due colonne quando c'è spazio). */}
      <div className="grid gap-8 @5xl:grid-cols-2 @5xl:items-start @7xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid gap-8">
          <Account account={d.account} ora={ora} onCollega={() => setAperto("account")} />
          <Campagne campagne={d.campagne} onApri={setAperto} onNuova={() => setAperto("nuova")} />
        </div>
        <div className="grid gap-8 @7xl:grid-cols-2 @7xl:items-start">
          <Richieste richieste={d.richieste} ora={ora} />
          <Registro eventi={d.eventi} ora={ora} />
        </div>
      </div>
      {aperto === "account" && <FoglioAccount onChiudi={() => setAperto(null)} />}
      {aperto !== null && aperto !== "account" && (
        <FoglioCampagna campagna={aperto === "nuova" ? null : aperto} risorse={d.risorse} onChiudi={() => setAperto(null)} />
      )}
    </div>
  );
}
