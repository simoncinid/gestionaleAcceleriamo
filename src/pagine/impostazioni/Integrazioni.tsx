import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { AreaTesto, Campo, Errore, Intestazione, Pulsante, Punto, Riga, Skeleton } from "../../ds";
import { momento } from "../../format";
import type { GiroFoglio, Impostazioni, Integrazione, RigaAnteprima, StatoSistema, VoceRegistro } from "../../types";
import { COLORE, ETICHETTA_STATO, Sezione, testoUltima, useImpostazioni, useStatoSistema } from "./parti";
import { daLinkFoglio, linkDelFoglio } from "./regole";

type Anteprima = { colonneMancanti: string[]; righe: RigaAnteprima[] };
const MAPPA: [keyof Impostazioni["foglio"]["mappa"], string][] = [
  ["data", "Colonna della data"], ["azienda", "Colonna dell'azienda"], ["referente", "Colonna del referente"], ["telefono", "Colonna del telefono"],
  ["email", "Colonna dell'email"], ["campagna", "Colonna della campagna"], ["inserzione", "Colonna dell'inserzione"], ["metaId", "Colonna dell'id Meta"],
];
const FUTURE: [string, string][] = [
  ["push", "Arriva con gli avvisi: chiave pubblica e dispositivi si vedranno qui."],
  ["telegram", "Arriva con gli avvisi: bot e chat collegate si vedranno qui."],
  ["claude", "Arriva con le funzioni di Claude: modelli, tetto e speso del mese si vedranno qui."],
];
const presente = (si: boolean) => (si ? "presente" : "mancante");

// Stato in testa a ogni blocco: il pallino, poi una riga sola. "Non collegato" è grigio, mai rosso.
function Blocco({ i, ora, children }: { i: Integrazione | undefined; ora: number; children: ReactNode }) {
  if (!i) return null;
  return (
    <Sezione titolo={i.etichetta} id={i.key}>
      <div className="grid gap-3 rounded-blocco border border-sabbia bg-avorio p-4">
        <p className="flex items-center gap-2 text-corpo">
          <Punto colore={COLORE[i.stato]} etichetta={ETICHETTA_STATO[i.stato]} />
          {i.stato === "errore" ? i.nota : testoUltima(i, ora)}
        </p>
        {children}
      </div>
    </Sezione>
  );
}

const Riquadro = ({ children }: { children: ReactNode }) => <div className="grid gap-1 text-corpo">{children}</div>;

function SezioneFoglio({ d, foglio, ora }: { d: StatoSistema; foglio: Impostazioni["foglio"]; ora: number }) {
  const qc = useQueryClient();
  const [f, setF] = useState(foglio);
  const [link, setLink] = useState(() => linkDelFoglio(foglio));
  const [erroreLink, setErroreLink] = useState<string | null>(null);
  const [anteprima, setAnteprima] = useState<Anteprima | null>(null);
  const salva = useMutation({
    mutationFn: async () => {
      const letto = link.trim() ? daLinkFoglio(link) : { spreadsheetId: "", gid: "0" };
      if ("errore" in letto) {
        setErroreLink(letto.errore);
        throw new Error(letto.errore);
      }
      if (f.attivo && !letto.spreadsheetId) throw new Error("Per accendere la lettura incolla prima il link del foglio");
      await api("/settings", { method: "PUT", json: { key: "foglio", value: { ...f, ...letto } } });
    },
    onSuccess: () => { toast.success("Foglio salvato"); for (const k of [["settings"], ["integrazioni"]]) void qc.invalidateQueries({ queryKey: k }); },
    onError: (e) => toast.error(e.message),
  });
  const leggi = useMutation({
    mutationFn: () => api<{ giro: GiroFoglio }>("/integrations/foglio/leggi", { method: "POST" }),
    onSuccess: ({ giro }) => {
      if (giro.errore) toast.error(giro.errore);
      else toast.success(`Lette ${giro.lette} righe: ${giro.create} lead nuovi, ${giro.agganciate} già presenti`);
      void qc.invalidateQueries({ queryKey: ["integrazioni"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const vedi = useMutation({
    mutationFn: () => api<Anteprima>("/integrations/foglio/anteprima"),
    onSuccess: setAnteprima,
    onError: (e) => toast.error(e.message),
  });
  const senzaLink = !foglio.spreadsheetId ? "Incolla il link del foglio e salva" : undefined;
  return (
    <>
      <Riquadro>
        <p>{`Account di servizio: ${presente(d.segreti.google)}`}</p>
        <p>{`Ultima riga letta: ${d.foglio.ultimaRiga}`}</p>
        {d.foglio.ultimaLettura != null && <p className="text-meta text-grigio">{`Ultima lettura ${momento(d.foglio.ultimaLettura, ora)}`}</p>}
      </Riquadro>
      <div className="flex flex-col gap-1.5">
        <Campo etichetta="Link della scheda" type="url" inputMode="url" placeholder="https://docs.google.com/spreadsheets/d/..." value={link}
          aiuto="Apri il foglio sulla scheda giusta e copia l'indirizzo intero dalla barra in alto. Il foglio va condiviso con chiunque abbia il link."
          aria-invalid={erroreLink ? true : undefined}
          onChange={(e) => { setLink(e.target.value); setErroreLink(null); }}
          onBlur={() => { if (link.trim()) { const l = daLinkFoglio(link); setErroreLink("errore" in l ? l.errore : null); } }} />
        {erroreLink && <p role="alert" className="text-secondaria text-errore">{erroreLink}</p>}
      </div>
      {d.segreti.google && (
        <Campo etichetta="Nome della scheda" aiuto="Serve all'account di servizio: il nome scritto sulla linguetta in basso" value={f.scheda} onChange={(e) => setF({ ...f, scheda: e.target.value })} />
      )}
      <label className="flex min-h-11 items-center gap-3 text-corpo">
        <input type="checkbox" className="size-5 accent-accento" checked={f.attivo} onChange={(e) => setF({ ...f, attivo: e.target.checked })} />
        Lettura automatica ogni 15 minuti
      </label>
      <details className="rounded-controllo border border-sabbia px-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-corpo font-semibold">Mappa delle colonne</summary>
        <div className="grid gap-3 pb-3">
          {MAPPA.map(([k, etichetta]) => <Campo key={k} etichetta={etichetta} value={f.mappa[k]} onChange={(e) => setF({ ...f, mappa: { ...f.mappa, [k]: e.target.value } })} />)}
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Pulsante variante="secondario" inCorso={salva.isPending} onClick={() => salva.mutate()}>Salva il foglio</Pulsante>
        <Pulsante variante="secondario" inCorso={leggi.isPending} motivoSpento={senzaLink ?? (foglio.attivo ? undefined : "Accendi la lettura e salva")} onClick={() => leggi.mutate()}>Leggi adesso</Pulsante>
        <Pulsante variante="fantasma" inCorso={vedi.isPending} motivoSpento={senzaLink} onClick={() => vedi.mutate()}>Anteprima della mappa</Pulsante>
      </div>
      {anteprima && (
        <div className="grid gap-2">
          {anteprima.colonneMancanti.map((c) => <p key={c} className="text-corpo text-errore">{`Colonna ${c} non trovata`}</p>)}
          {anteprima.righe.length === 0 && <p className="text-secondaria text-grigio">Il foglio non ha ancora righe sotto l'intestazione</p>}
          <ul className="grid gap-2">
            {anteprima.righe.map((r) => (
              <li key={r.riga}>
                <Riga titolo={`Riga ${r.riga}: ${r.azienda || "senza azienda"}`} secondaria={r.referente || undefined}
                  meta={r.scartata ? `Scartata: ${r.scartata}` : (r.telefono ?? r.email ?? undefined)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function SezioneAggancio({ d, ora }: { d: StatoSistema; ora: number }) {
  const qc = useQueryClient();
  const registro = useQuery({ queryKey: ["aggancio-registro"], queryFn: () => api<{ voci: VoceRegistro[] }>("/integrations/aggancio/registro").then((r) => r.voci) });
  const prova = useMutation({
    mutationFn: () => api("/integrations/aggancio/prova", { method: "POST" }),
    onSuccess: () => { toast.success("Prova registrata: nessun lead toccato"); void qc.invalidateQueries({ queryKey: ["aggancio-registro"] }); },
    onError: (e) => toast.error(e.message),
  });
  const indirizzo = typeof window === "undefined" ? "/api/hooks/proposals" : `${window.location.origin}/api/hooks/proposals`;
  return (
    <>
      <Riquadro>
        <p className="break-all">{`Indirizzo: ${indirizzo}`}</p>
        <p>{`Chiave: ${presente(d.segreti.aggancio)}`}</p>
      </Riquadro>
      <Pulsante variante="secondario" className="justify-self-start" inCorso={prova.isPending}
        motivoSpento={d.segreti.aggancio ? undefined : "Manca la chiave: si mette con wrangler secret put PROPOSAL_HOOK_KEY"} onClick={() => prova.mutate()}>
        Proposta di prova
      </Pulsante>
      <h3 className="text-corpo font-semibold">Ultime 20 chiamate</h3>
      {registro.data?.length === 0 && <p className="text-secondaria text-grigio">Ancora nessuna chiamata</p>}
      <ul className="grid gap-2">
        {registro.data?.map((v) => (
          <li key={v.id}><Riga titolo={v.number ?? "Senza numero"} secondaria={v.outcome ?? "senza esito"} meta={<><span className="block">{momento(v.at, ora)}</span><span className="block">{`Risposta ${v.status}`}</span></>} /></li>
        ))}
      </ul>
    </>
  );
}

function SezioneResend({ d, conferma }: { d: StatoSistema; conferma: Impostazioni["conferma"] }) {
  const qc = useQueryClient();
  const [c, setC] = useState(conferma);
  const salva = useMutation({
    mutationFn: () => api("/settings", { method: "PUT", json: { key: "conferma", value: c } }),
    onSuccess: () => { toast.success("Email salvata"); void qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e) => toast.error(e.message),
  });
  const prova = useMutation({
    mutationFn: () => api<{ a: string }>("/integrations/resend/prova", { method: "POST" }),
    onSuccess: (r) => { toast.success(`Email di prova mandata a ${r.a}`); void qc.invalidateQueries({ queryKey: ["integrazioni"] }); },
    onError: (e) => { toast.error(e.message); void qc.invalidateQueries({ queryKey: ["integrazioni"] }); },
  });
  return (
    <>
      <Riquadro><p>{`Chiave: ${presente(d.segreti.resend)}`}</p></Riquadro>
      <label className="flex min-h-11 items-center gap-3 text-corpo">
        <input type="checkbox" className="size-5 accent-accento" checked={c.attiva} onChange={(e) => setC({ ...c, attiva: e.target.checked })} />
        Email di conferma ai lead nuovi
      </label>
      <Campo etichetta="Mittente" value={c.mittente} onChange={(e) => setC({ ...c, mittente: e.target.value })} />
      <Campo etichetta="Le risposte vanno a" type="email" value={c.rispondiA} onChange={(e) => setC({ ...c, rispondiA: e.target.value })} />
      <AreaTesto etichetta="Piede dell'email" rows={3} value={c.piede} onChange={(e) => setC({ ...c, piede: e.target.value })} />
      <div className="flex flex-wrap gap-2">
        <Pulsante variante="secondario" inCorso={salva.isPending} onClick={() => salva.mutate()}>Salva l'email</Pulsante>
        <Pulsante variante="secondario" inCorso={prova.isPending}
          motivoSpento={d.segreti.resend ? undefined : "Manca la chiave: si mette con wrangler secret put RESEND_API_KEY"} onClick={() => prova.mutate()}>
          Manda un'email di prova a me
        </Pulsante>
      </div>
    </>
  );
}

// Spec 11.5: ogni integrazione ha la stessa forma (stato, configurazione, una prova). Nessun pulsante pieno.
export function Integrazioni({ ora = Date.now() }: { ora?: number } = {}) {
  const s = useStatoSistema();
  const imp = useImpostazioni();
  if (s.isLoading || imp.isLoading) return <div className="mx-auto max-w-[720px] p-4"><Skeleton righe={8} /></div>;
  const errore = s.error ?? imp.error;
  if (errore) return <div className="mx-auto max-w-[720px] p-4"><Errore errore={errore} onRiprova={() => { void s.refetch(); void imp.refetch(); }} /></div>;
  const d = s.data!;
  const voce = (k: string) => d.integrazioni.find((i) => i.key === k);
  const attive = d.integrazioni.filter((i) => i.key !== "giro" && (i.stato === "ok" || i.stato === "errore")).length;
  return (
    <div className="mx-auto grid max-w-[720px] gap-8 p-4 pb-28">
      <Intestazione eyebrow="Impostazioni" titolo="Integrazioni" numero={attive || undefined} coda={attive === 1 ? "attiva" : "attive"}>
        <p className="text-secondaria text-grigio">I segreti non si vedono e non si cambiano da qui: si mettono dal terminale con wrangler secret put. Qui si vede solo se ci sono.</p>
      </Intestazione>
      <Blocco i={voce("meta")} ora={ora}>
        <Riquadro><p>{`Segreti di Meta: ${presente(d.segreti.meta)}`}</p></Riquadro>
        <p className="text-secondaria text-grigio">Per una prova usa lo strumento di test dei lead di Meta (developers.facebook.com/tools/lead-ads-testing): il lead finto arriva in Scaletta in pochi secondi.</p>
      </Blocco>
      <Blocco i={voce("foglio")} ora={ora}><SezioneFoglio d={d} foglio={imp.data!.foglio} ora={ora} /></Blocco>
      <Blocco i={voce("aggancio")} ora={ora}><SezioneAggancio d={d} ora={ora} /></Blocco>
      <Blocco i={voce("resend")} ora={ora}><SezioneResend d={d} conferma={imp.data!.conferma} /></Blocco>
      {FUTURE.map(([k, testo]) => <Blocco key={k} i={voce(k)} ora={ora}><p className="text-secondaria text-grigio">{testo}</p></Blocco>)}
      <Sezione titolo="R2 e Drive"><p className="text-corpo">Non attivo: i documenti sono link.</p></Sezione>
      <Sezione titolo="Google Calendar"><p className="text-corpo">In arrivo con il passaggio a cliente.</p></Sezione>
    </div>
  );
}
