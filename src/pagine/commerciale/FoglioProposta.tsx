import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Campo, CampoQuando, Foglio, Pulsante, Riga, Selettore } from "../../ds";
import { euro } from "../../format";
import { useDebounced } from "../../hooks";
import type { LeadListItem, PropostaRiga } from "../../types";
import { centesimi } from "./scheda";

// Dopo ogni scrittura su una proposta: elenco, dettaglio, Oggi e il lead (fase e prossima azione possono cambiare).
export function aggiornaDopoProposta(qc: QueryClient, id: string | null, leadId: string | null) {
  const chiavi: unknown[][] = [["proposte"], ["today"], ["leads"], ["badge"]];
  if (id) chiavi.push(["proposta", id]);
  if (leadId) chiavi.push(["lead", leadId]);
  for (const k of chiavi) void qc.invalidateQueries({ queryKey: k });
}

// Ricerca del lead per nome, referente o telefono: la usano il "+" e i fogli delle proposte.
export function CercaLead({ onScelto }: { onScelto: (l: LeadListItem) => void }) {
  const [q, setQ] = useState("");
  const cerca = useDebounced(q.trim(), 250);
  const r = useQuery({
    queryKey: ["leads", { q: cerca }],
    queryFn: () => api<{ leads: LeadListItem[] }>(`/leads?q=${encodeURIComponent(cerca)}`).then((x) => x.leads),
    enabled: cerca.length > 1,
  });
  return (
    <div className="flex flex-col gap-3">
      <Campo etichetta="Cerca il lead" placeholder="Azienda, referente o telefono" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
      {cerca.length > 1 && r.data?.length === 0 && <p className="text-secondaria text-grigio">Nessun lead trovato.</p>}
      <ul className="flex flex-col gap-2">
        {r.data?.slice(0, 8).map((l) => (
          <li key={l.id}><Riga titolo={l.company} secondaria={l.contactName ?? undefined} onClick={() => onScelto(l)} /></li>
        ))}
      </ul>
    </div>
  );
}

export function FoglioAbbina({ proposta, onChiudi }: { proposta: PropostaRiga; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [lead, setLead] = useState<LeadListItem | null>(null);
  const salva = useMutation({
    mutationFn: (leadId: string) => api(`/proposals/${proposta.id}/abbina`, { method: "POST", json: { leadId } }),
    onSuccess: (_, leadId) => { toast.success(`Proposta ${proposta.number} abbinata`); aggiornaDopoProposta(qc, proposta.id, leadId); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  // Voce 44: scegliere il lead non abbina subito; si conferma col pulsante, "Cambia" torna alla ricerca.
  return (
    <Foglio aperto titolo={`Abbina ${proposta.number}`} onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" motivoSpento={lead ? undefined : "Scegli il lead"} inCorso={salva.isPending}
        onClick={() => lead && salva.mutate(lead.id)}>{lead ? `Abbina a ${lead.company}` : "Abbina"}</Pulsante>}>
      {lead ? <Riga titolo={lead.company} secondaria="Lead" destra={<Pulsante variante="fantasma" onClick={() => setLead(null)}>Cambia</Pulsante>} /> : <CercaLead onScelto={setLead} />}
    </Foglio>
  );
}

// Come il server: solo link https:// (niente javascript: o http://). Vuoto non è un errore.
export const motivoLinkPdf = (testo: string) => (testo.trim() && !/^https:\/\/\S+$/.test(testo.trim()) ? "Il link deve iniziare con https://" : undefined);

const OPZIONI = [{ valore: "standard" as const, etichetta: "Standard" }, { valore: "proprieta" as const, etichetta: "Proprietà del codice" }];

// Proposta inserita a mano dal "+" (quando il preventivo non passa dal wiki).
export function FoglioPropostaManuale({ leadIniziale, onChiudi }: { leadIniziale?: LeadListItem; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [lead, setLead] = useState<LeadListItem | null>(leadIniziale ?? null);
  const [v, setV] = useState({ number: "", setup: "", canone: "", ore: "", alternativa: "", pdfUrl: "" });
  const [opzione, setOpzione] = useState<"standard" | "proprieta">("standard");
  const [validita, setValidita] = useState<number | null>(null);
  const [stato, setStato] = useState<"bozza" | "registrata">("registrata");
  const corpo = {
    leadId: lead?.id, number: v.number.trim(), option: opzione, setupCents: centesimi(v.setup), feeCents: opzione === "proprieta" ? null : centesimi(v.canone),
    hoursEstimate: v.ore.trim() ? Number(v.ore) : null, alternativeCents: centesimi(v.alternativa), validUntil: validita, pdfUrl: v.pdfUrl.trim() || null, status: stato,
  };
  const salva = useMutation({
    mutationFn: () => api("/proposals", { method: "POST", json: corpo }),
    onSuccess: () => { toast.success("Proposta salvata"); aggiornaDopoProposta(qc, null, lead?.id ?? null); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  const campo = (k: keyof typeof v) => ({ value: v[k], onChange: (e: ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value })) });
  const manca = !lead ? "Scegli il lead" : !corpo.number ? "Serve il numero" : corpo.hoursEstimate != null && !Number.isInteger(corpo.hoursEstimate) ? "Ore in numero intero" : motivoLinkPdf(v.pdfUrl);
  return (
    <Foglio aperto titolo="Proposta a mano" onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={manca} onClick={() => salva.mutate()}>Salva proposta</Pulsante>}>
      <div className="flex flex-col gap-4">
        {lead ? <Riga titolo={lead.company} secondaria="Lead" destra={<Pulsante variante="fantasma" onClick={() => setLead(null)}>Cambia</Pulsante>} /> : <CercaLead onScelto={setLead} />}
        <Campo etichetta="Numero" placeholder="ACC-2026-014" {...campo("number")} />
        <Selettore etichetta="Opzione" opzioni={OPZIONI} valore={opzione} onCambia={setOpzione} />
        <Campo etichetta="Setup in euro" inputMode="decimal" {...campo("setup")} />
        {opzione === "standard" && <Campo etichetta="Canone mensile in euro" inputMode="decimal" {...campo("canone")} />}
        <Campo etichetta="Ore stimate" inputMode="numeric" {...campo("ore")} />
        <Campo etichetta="Prezzo con la proprietà del codice" aiuto="Facoltativo" inputMode="decimal" {...campo("alternativa")} />
        <CampoQuando etichetta="Valida fino al" valore={validita} onCambia={setValidita} />
        <Campo etichetta="Link al PDF" aiuto="Facoltativo" type="url" inputMode="url" {...campo("pdfUrl")} />
        <Selettore etichetta="Stato" opzioni={[{ valore: "registrata", etichetta: "Mandata al cliente" }, { valore: "bozza", etichetta: "Bozza" }]} valore={stato} onCambia={setStato} />
      </div>
    </Foglio>
  );
}

// PV12: chi accetta sceglie l'opzione qui; con la proprietà del codice il lead prende il prezzo alternativo e nessun canone.
export function FoglioAccettazione({ proposta: p, onChiudi }: { proposta: PropostaRiga; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [opzione, setOpzione] = useState<"standard" | "proprieta">(p.option);
  const salva = useMutation({
    mutationFn: () => api(`/proposals/${p.id}`, { method: "PATCH", json: { status: "accettata", option: opzione } }),
    onSuccess: () => { toast.success(`Proposta ${p.number} accettata`); aggiornaDopoProposta(qc, p.id, p.leadId); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  const proprieta = p.alternativeCents ?? p.setupCents;
  const opzioni = [
    { valore: "standard" as const, etichetta: "Standard", meta: `Setup ${euro(p.setupCents ?? 0)}, canone ${euro(p.feeCents ?? 0)}` },
    { valore: "proprieta" as const, etichetta: "Proprietà del codice", meta: `Setup ${euro(proprieta ?? 0)}, nessun canone` },
  ];
  return (
    <Foglio aperto titolo={`Accettata ${p.number}`} onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} onClick={() => salva.mutate()}>Segna accettata</Pulsante>}>
      <div className="flex flex-col gap-3">
        <Selettore etichetta="Opzione accettata" opzioni={opzioni} valore={opzione} onCambia={setOpzione} />
        <p className="text-secondaria text-grigio tabular-nums">{opzioni.find((o) => o.valore === opzione)?.meta}</p>
      </div>
    </Foglio>
  );
}

// Il link al PDF per chi non ha il wiki sotto mano (Drive, cartella condivisa).
export function FoglioLinkPdf({ proposta: p, onChiudi }: { proposta: PropostaRiga; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState(p.pdfUrl ?? "");
  const pulito = url.trim();
  const salva = useMutation({
    mutationFn: () => api(`/proposals/${p.id}`, { method: "PATCH", json: { pdfUrl: pulito || null } }),
    onSuccess: () => { toast.success("Link al PDF salvato"); aggiornaDopoProposta(qc, p.id, p.leadId); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  const manca = motivoLinkPdf(pulito) ?? (!pulito && !p.pdfUrl ? "Incolla il link" : undefined);
  return (
    <Foglio aperto titolo="Link al PDF" onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={manca} onClick={() => salva.mutate()}>Salva il link</Pulsante>}>
      <Campo etichetta="Link al PDF" placeholder="https://drive.google.com/..." type="url" inputMode="url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} />
    </Foglio>
  );
}
