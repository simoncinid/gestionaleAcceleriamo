import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { mostraErrore } from "../../errori";
import { AreaTesto, Campo, Interruttore, Pulsante, Riga } from "../../ds";
import { momento } from "../../format";
import type { GiroFoglio, Impostazioni, RigaAnteprima, StatoSistema, VoceRegistro } from "../../types";
import { daLinkFoglio, leggiFinoAllaFine, linkDelFoglio } from "./regole";

// Sezioni della 1A spostate dal vecchio Integrazioni.tsx nel dettaglio di ogni integrazione (Task 12), stesso comportamento.
type Anteprima = { colonneMancanti: string[]; righe: RigaAnteprima[] };
const MAPPA: [keyof Impostazioni["foglio"]["mappa"], string][] = [
  ["data", "Colonna della data"], ["azienda", "Colonna dell'azienda"], ["referente", "Colonna del referente"], ["telefono", "Colonna del telefono"],
  ["email", "Colonna dell'email"], ["campagna", "Colonna della campagna"], ["inserzione", "Colonna dell'inserzione"], ["metaId", "Colonna dell'id Meta"],
];
const presente = (si: boolean) => (si ? "presente" : "mancante");

const Riquadro = ({ children }: { children: ReactNode }) => <div className="grid gap-1 text-corpo">{children}</div>;

export function SezioneFoglio({ d, foglio, ora }: { d: StatoSistema; foglio: Impostazioni["foglio"]; ora: number }) {
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
    onError: (e) => mostraErrore(e),
  });
  // Un solo avviso che si aggiorna: avanzamento mentre gira, esito alla fine.
  const leggi = useMutation({
    mutationFn: () => {
      const id = toast.loading("Lettura del foglio in corso");
      return leggiFinoAllaFine(
        () => api<{ giro: GiroFoglio | null }>("/integrations/foglio/leggi", { method: "POST" }).then((r) => r.giro),
        (t) => toast.loading(`Lette ${t.lette} righe, creati ${t.create} lead`, { id }),
      ).then((t) => ({ ...t, id }), (e: Error) => { toast.error(e.message, { id }); throw e; });
    },
    onSuccess: (t) => {
      if (t.errore) toast.error(t.errore, { id: t.id });
      else toast.success(`Lette ${t.lette} righe, creati ${t.create} lead${t.ancora ? ": il resto lo legge il giro automatico" : ""}`, { id: t.id });
      void qc.invalidateQueries({ queryKey: ["integrazioni"] });
    },
  });
  const vedi = useMutation({
    mutationFn: () => api<Anteprima>("/integrations/foglio/anteprima"),
    onSuccess: setAnteprima,
    onError: (e) => mostraErrore(e),
  });
  const senzaLink = !foglio.spreadsheetId ? "Incolla il link del foglio e salva" : undefined;
  return (
    <>
      <Riquadro>
        <p>{`Account di servizio: ${presente(d.segreti.google)}`}</p>
        {d.foglio.ultimaLettura == null ? <p className="text-meta text-grigio">Il foglio non è ancora stato letto</p> : (
          <>
            <p>{`Ultima riga letta: ${d.foglio.ultimaRiga}`}</p>
            <p className="text-meta text-grigio">{`Ultima lettura ${momento(d.foglio.ultimaLettura, ora)}`}</p>
          </>
        )}
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
      <Interruttore etichetta="Lettura automatica ogni 15 minuti" acceso={f.attivo} onCambia={(v) => setF({ ...f, attivo: v })} />
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

export function SezioneAggancio({ d, ora }: { d: StatoSistema; ora: number }) {
  const qc = useQueryClient();
  const registro = useQuery({ queryKey: ["aggancio-registro"], queryFn: () => api<{ voci: VoceRegistro[] }>("/integrations/aggancio/registro").then((r) => r.voci) });
  const prova = useMutation({
    mutationFn: () => api("/integrations/aggancio/prova", { method: "POST" }),
    onSuccess: () => { toast.success("Prova registrata: nessun lead toccato"); void qc.invalidateQueries({ queryKey: ["aggancio-registro"] }); },
    onError: (e) => mostraErrore(e),
  });
  const indirizzo = typeof window === "undefined" ? "/api/hooks/proposals" : `${window.location.origin}/api/hooks/proposals`;
  return (
    <>
      <Riquadro>
        <p className="break-all">{`Indirizzo: ${indirizzo}`}</p>
        <p>{`Chiave: ${presente(d.segreti.aggancio)}`}</p>
      </Riquadro>
      <Pulsante variante="secondario" className="justify-self-start" inCorso={prova.isPending}
        motivoSpento={d.segreti.aggancio ? undefined : "Manca la chiave dell'aggancio: la mette chi gestisce il server"} onClick={() => prova.mutate()}>
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

export function SezioneResend({ d, conferma }: { d: StatoSistema; conferma: Impostazioni["conferma"] }) {
  const qc = useQueryClient();
  const [c, setC] = useState(conferma);
  const salva = useMutation({
    mutationFn: () => api("/settings", { method: "PUT", json: { key: "conferma", value: c } }),
    onSuccess: () => { toast.success("Email salvata"); void qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e) => mostraErrore(e),
  });
  const prova = useMutation({
    mutationFn: () => api<{ a: string }>("/integrations/resend/prova", { method: "POST" }),
    onSuccess: (r) => { toast.success(`Email di prova mandata a ${r.a}`); void qc.invalidateQueries({ queryKey: ["integrazioni"] }); },
    onError: (e) => { mostraErrore(e); void qc.invalidateQueries({ queryKey: ["integrazioni"] }); },
  });
  return (
    <>
      <Riquadro><p>{`Chiave: ${presente(d.segreti.resend)}`}</p></Riquadro>
      <Interruttore etichetta="Email di conferma ai lead nuovi" acceso={c.attiva} onCambia={(v) => setC({ ...c, attiva: v })} />
      <Campo etichetta="Mittente" value={c.mittente} onChange={(e) => setC({ ...c, mittente: e.target.value })} />
      <Campo etichetta="Le risposte vanno a" type="email" value={c.rispondiA} onChange={(e) => setC({ ...c, rispondiA: e.target.value })} />
      <AreaTesto etichetta="Piede dell'email" rows={3} value={c.piede} onChange={(e) => setC({ ...c, piede: e.target.value })} />
      <div className="flex flex-wrap gap-2">
        <Pulsante variante="secondario" inCorso={salva.isPending} onClick={() => salva.mutate()}>Salva l'email</Pulsante>
        <Pulsante variante="secondario" inCorso={prova.isPending}
          motivoSpento={d.segreti.resend ? undefined : "Manca la chiave di Resend: la mette chi gestisce il server"} onClick={() => prova.mutate()}>
          Manda un'email di prova a me
        </Pulsante>
      </div>
    </>
  );
}
