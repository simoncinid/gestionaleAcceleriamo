import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { mostraErrore } from "../../errori";
import { Campo, Foglio, Interruttore, Pulsante, Riga } from "../../ds";
import type { Profilo } from "../../types";
import { AttivaNotifiche } from "./AttivaNotifiche";
import { useProfilo, useStatoSistema } from "./parti";

// Stesso ordine e stessi nomi della tabella degli eventi (worker/avvisi/eventi.ts).
const EVENTI: [string, string][] = [
  ["lead_nuovo", "Lead nuovo"], ["sla_90", "Prima chiamata tra 30 minuti"], ["sla_scaduto", "Prima chiamata scaduta"],
  ["proposta_oggi", "Proposta da seguire oggi"], ["fine_pausa", "Fine della pausa"], ["claude_tetto", "Claude al tetto del mese"],
  ["meta_48h", "Meta senza lead da 48 ore"], ["integrazione_rotta", "Integrazione rotta"],
];
export const EVENTI_TELEGRAM = "Lead nuovo, Prima chiamata scaduta, Claude al tetto del mese";
const ORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;
type Aperto = null | "password" | "dispositivi" | "telegram" | "avvisi" | "silenzio";
const errore = (e: Error) => mostraErrore(e);

function useSalvaProfilo(onFatto?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (corpo: Partial<Pick<Profilo, "notifyPrefs" | "quietHours" | "name">>) => api<Profilo>("/me", { method: "PATCH", json: corpo }),
    onSuccess: (p) => { qc.setQueryData(["me", "profilo"], p); toast.success("Salvato"); onFatto?.(); },
    onError: errore,
  });
}

// Collegamento della propria chat (Task 5): il server dà un link con un codice valido 15 minuti; il giro lo conferma.
export function useTelegram() {
  const qc = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const collega = useMutation({
    mutationFn: () => api<{ link: string }>("/integrations/telegram/collega", { method: "POST" }),
    onSuccess: (r) => setLink(r.link),
    onError: errore,
  });
  const scollega = useMutation({
    mutationFn: () => api("/integrations/telegram", { method: "DELETE" }),
    onSuccess: () => { setLink(null); toast.success("Telegram scollegato"); void qc.invalidateQueries({ queryKey: ["me", "profilo"] }); void qc.invalidateQueries({ queryKey: ["integrazioni"] }); },
    onError: errore,
  });
  return { link, collega, scollega };
}

// Dopo "Collega": il link apre il bot con il codice già scritto. Un link vero, non una finestra aperta dal codice (i browser la bloccano).
export function LinkTelegram({ link }: { link: string }) {
  return (
    <div className="grid gap-1">
      <a className="text-corpo font-semibold text-accento-testo underline underline-offset-4" href={link} target="_blank" rel="noopener noreferrer">Apri Telegram e premi Avvia</a>
      <p className="text-meta text-grigio">Il codice vale 15 minuti. La chat risulta collegata entro qualche minuto.</p>
    </div>
  );
}

function FoglioPassword({ onChiudi }: { onChiudi: () => void }) {
  const [attuale, setAttuale] = useState("");
  const [nuova, setNuova] = useState("");
  const [ripeti, setRipeti] = useState("");
  const m = useMutation({
    mutationFn: () => api("/me/password", { method: "POST", json: { attuale, nuova } }),
    onSuccess: () => { toast.success("Password cambiata: gli altri dispositivi sono usciti"); onChiudi(); },
    onError: errore,
  });
  const motivo = !attuale ? "Scrivi la password attuale" : nuova.length < 10 ? "La nuova password ha almeno 10 caratteri" : nuova !== ripeti ? "Le due password nuove non coincidono" : undefined;
  return (
    <Foglio aperto titolo="Cambia la password" onChiudi={onChiudi} principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={m.isPending} motivoSpento={motivo} onClick={() => m.mutate()}>Cambia la password</Pulsante>}>
      <Campo etichetta="Password attuale" type="password" autoComplete="current-password" value={attuale} onChange={(e) => setAttuale(e.target.value)} />
      <Campo etichetta="Password nuova" type="password" autoComplete="new-password" value={nuova} onChange={(e) => setNuova(e.target.value)} aiuto="Almeno 10 caratteri" />
      <Campo etichetta="Ripeti la password nuova" type="password" autoComplete="new-password" value={ripeti} onChange={(e) => setRipeti(e.target.value)} />
      <p className="text-secondaria text-grigio">Gli altri dispositivi escono: si rientra con la password nuova.</p>
    </Foglio>
  );
}

function FoglioAvvisi({ p, onChiudi }: { p: Profilo; onChiudi: () => void }) {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(p.notifyPrefs);
  const salva = useSalvaProfilo(onChiudi);
  return (
    <Foglio aperto titolo="Avvisi per evento" onChiudi={onChiudi} principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} onClick={() => salva.mutate({ notifyPrefs: prefs })}>Salva gli avvisi</Pulsante>}>
      <p className="text-secondaria text-grigio">Spento vuol dire niente notifica e niente Telegram per quell'evento. Dentro l'app l'avviso resta.</p>
      <div className="flex flex-col gap-2">{EVENTI.map(([k, t]) => <Interruttore key={k} etichetta={t} acceso={prefs[k] ?? true} onCambia={(v) => setPrefs((x) => ({ ...x, [k]: v }))} />)}</div>
    </Foglio>
  );
}

function FoglioSilenzio({ p, onChiudi }: { p: Profilo; onChiudi: () => void }) {
  const [s, setS] = useState(p.quietHours);
  const salva = useSalvaProfilo(onChiudi);
  const motivo = ORA_VALIDA.test(s.da) && ORA_VALIDA.test(s.a) ? undefined : "Scrivi le ore come 22:00";
  return (
    <Foglio aperto titolo="Ore di silenzio" onChiudi={onChiudi} principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={motivo} onClick={() => salva.mutate({ quietHours: s })}>Salva le ore di silenzio</Pulsante>}>
      <Interruttore etichetta="Silenzio attivo" acceso={s.attive} onCambia={(v) => setS({ ...s, attive: v })} aiuto="In queste ore niente notifiche e niente Telegram: l'avviso resta nell'app" />
      <Campo etichetta="Dalle" inputMode="numeric" placeholder="22:00" maxLength={5} value={s.da} onChange={(e) => setS({ ...s, da: e.target.value })} />
      <Campo etichetta="Alle" inputMode="numeric" placeholder="07:30" maxLength={5} value={s.a} onChange={(e) => setS({ ...s, a: e.target.value })} />
    </Foglio>
  );
}

// Voce 64: scollegare è reversibile ma toglie gli avvisi, quindi chiede il secondo tocco (mai confirm()).
export function ScollegaTelegram({ scollega, testo }: { scollega: { isPending: boolean; mutate: () => void }; testo: string }) {
  const [chiede, setChiede] = useState(false);
  return (
    <Pulsante variante={chiede ? "distruttivo" : "secondario"} inCorso={scollega.isPending} onBlur={() => setChiede(false)}
      onClick={() => (chiede ? scollega.mutate() : setChiede(true))}>
      {chiede ? "Tocca di nuovo per scollegare" : testo}
    </Pulsante>
  );
}

function FoglioTelegram({ p, onChiudi }: { p: Profilo; onChiudi: () => void }) {
  const stato = useStatoSistema();
  const { link, collega, scollega } = useTelegram();
  const bot = stato.data?.integrazioni.find((i) => i.key === "telegram");
  const senzaBot = bot?.stato === "spento";
  const principale = p.telegram || senzaBot || link ? undefined
    : <Pulsante variante="primario" misura="lg" className="w-full" inCorso={collega.isPending} onClick={() => collega.mutate()}>Collega Telegram</Pulsante>;
  return (
    <Foglio aperto titolo="Telegram" onChiudi={onChiudi} principale={principale}>
      {senzaBot && !p.telegram ? (
        <p className="text-corpo">Telegram non è ancora attivo: manca il bot, lo collega chi gestisce il server. Gli avvisi restano dentro l'app.</p>
      ) : p.telegram ? (
        <>
          <p className="text-corpo">La tua chat è collegata.</p>
          <p className="text-secondaria text-grigio">{`Arrivano solo tre avvisi: ${EVENTI_TELEGRAM}.`}</p>
          <div><ScollegaTelegram scollega={scollega} testo="Scollega Telegram" /></div>
        </>
      ) : (
        <>
          <p className="text-corpo">{`Telegram manda solo tre avvisi: ${EVENTI_TELEGRAM}.`}</p>
          {link ? <LinkTelegram link={link} /> : <p className="text-secondaria text-grigio">Premi Collega: si apre il bot con il tuo codice.</p>}
        </>
      )}
    </Foglio>
  );
}

// Il componente del Task 4: attiva le notifiche su questo dispositivo ed elenca gli altri.
function FoglioDispositivi({ onChiudi }: { onChiudi: () => void }) {
  const qc = useQueryClient();
  // Chiudendo si rilegge il profilo: il numero dei dispositivi può essere cambiato.
  const chiudi = () => { void qc.invalidateQueries({ queryKey: ["me", "profilo"] }); onChiudi(); };
  return (
    <Foglio aperto titolo="Dispositivi" onChiudi={chiudi}>
      <AttivaNotifiche />
    </Foglio>
  );
}

const dispositivi = (n: number) => (n === 0 ? "Nessun dispositivo" : n === 1 ? "1 dispositivo" : `${n} dispositivi`);

// Spec 11.4 e prototipo 31: "Il mio profilo" è un elenco di righe, ognuna apre il suo foglio.
export function IlMioProfilo() {
  const q = useProfilo();
  const [aperto, setAperto] = useState<Aperto>(null);
  const p = q.data;
  const chiudi = () => setAperto(null);
  return (
    <section aria-label="Il mio profilo" className="grid gap-3">
      <h2 className="font-display text-titolo-card">Il mio profilo</h2>
      {q.isLoading ? <p className="text-secondaria text-grigio">Caricamento del profilo</p>
        : !p ? <div className="grid gap-2"><p className="text-corpo">Il profilo non si è caricato.</p><div><Pulsante variante="secondario" onClick={() => void q.refetch()}>Riprova</Pulsante></div></div>
        : (
          <ul className="grid grid-cols-1 gap-2">
            <li><Riga titolo="Password" secondaria="Cambiala quando vuoi: gli altri dispositivi escono" onClick={() => setAperto("password")} /></li>
            <li><Riga titolo="Dispositivi push" secondaria={dispositivi(p.dispositivi)} onClick={() => setAperto("dispositivi")} /></li>
            <li><Riga titolo="Telegram" secondaria={p.telegram ? "Collegato" : "Non collegato"} onClick={() => setAperto("telegram")} /></li>
            <li><Riga titolo="Avvisi per evento" secondaria={Object.values(p.notifyPrefs).every(Boolean) ? "Tutti accesi" : `${Object.values(p.notifyPrefs).filter((v) => !v).length} spenti`} onClick={() => setAperto("avvisi")} /></li>
            <li><Riga titolo="Ore di silenzio" secondaria={p.quietHours.attive ? `dalle ${p.quietHours.da} alle ${p.quietHours.a}` : "Spente"} onClick={() => setAperto("silenzio")} /></li>
          </ul>
        )}
      {p && aperto === "password" && <FoglioPassword onChiudi={chiudi} />}
      {p && aperto === "dispositivi" && <FoglioDispositivi onChiudi={chiudi} />}
      {p && aperto === "telegram" && <FoglioTelegram p={p} onChiudi={chiudi} />}
      {p && aperto === "avvisi" && <FoglioAvvisi p={p} onChiudi={chiudi} />}
      {p && aperto === "silenzio" && <FoglioSilenzio p={p} onChiudi={chiudi} />}
    </section>
  );
}
