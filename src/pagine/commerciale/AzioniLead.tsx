import { CaretDown, Phone, WhatsappLogo } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Foglio, Pulsante, Selettore, cx } from "../../ds";
import { linkTel, linkWhatsApp } from "../../format";
import { useModelli } from "../../hooks";
import type { Stage } from "../../types";
import { callPerFase } from "../../../worker/regole/fasi-call";
import { avviaContatto } from "./chiamata";
import { classePallino } from "./coloriLead";
import { FoglioChiusura } from "./FoglioChiusura";
import { FoglioEsito } from "./FoglioEsito";
import { FoglioFissaCall } from "./FoglioFissaCall";
import { callDellAssenza, useNonPresentato } from "./nonPresentato";
import { compila, modelloPer } from "./modelli";
import { MenuPunti, Tendina, VoceTendina } from "./Tendina";
import { aperto, type RigaLead } from "./tabellaLead";

// Azioni dalla tabella dei lead (contratto blocco 1, sezione 4, modifica 20): fase dalla cella, Chiama e WhatsApp,
// menu "..." della riga. Le regole sono quelle della scheda: le fasi con una call chiedono giorno e ora,
// Cliente chiede i dati, le fasi di chiusura chiedono il motivo; le altre cambiano subito con "Annulla" nel toast.

export type FoglioRiga =
  | { tipo: "fase"; lead: RigaLead; fase: Stage }
  | { tipo: "esito"; lead: RigaLead }
  | { tipo: "fissa"; lead: RigaLead }
  | { tipo: "responsabile"; lead: RigaLead };

const INVALIDA = [["leads"], ["today"], ["badge"]];

function useAggiorna() {
  const qc = useQueryClient();
  return (leadId: string) => { for (const k of [...INVALIDA, ["lead", leadId]]) void qc.invalidateQueries({ queryKey: k }); };
}

// Cambio di fase senza foglio. Riaprire un lead chiuso gli ridà una prossima azione (come nella scheda).
export function useSpostaFase(fasi: Stage[]) {
  const aggiorna = useAggiorna();
  const sposta = useMutation({
    mutationFn: ({ lead, stageId }: { lead: RigaLead; stageId: string; prima: string }) => {
      const riapre = !aperto(lead) && fasi.find((f) => f.id === stageId)?.kind === "open";
      return api(`/leads/${lead.id}`, { method: "PATCH", json: riapre ? { stageId, nextAction: "Ricontattare", nextActionAt: Date.now() } : { stageId } });
    },
    onSuccess: (_r, { lead, stageId, prima }) => {
      aggiorna(lead.id);
      const nome = fasi.find((f) => f.id === stageId)?.label ?? "";
      if (stageId !== prima) toast(`${lead.company} in ${nome}`, { action: { label: "Annulla", onClick: () => sposta.mutate({ lead: { ...lead, stageId }, stageId: prima, prima: stageId }) } });
    },
    onError: (e) => toast.error(e.message),
  });
  return sposta;
}

// La fase scelta decide: foglio della call, foglio di chiusura o cambio diretto.
export function scegliFase(lead: RigaLead, fase: Stage, apri: (f: FoglioRiga) => void, sposta: (stageId: string) => void) {
  if (fase.id === lead.stageId) return;
  if (fase.requiresReason || fase.kind === "won" || callPerFase(fase.id)) apri({ tipo: "fase", lead, fase });
  else sposta(fase.id);
}

// Cella Fase: sembra testo (pallino e nome), al passaggio mostra la freccia; si apre con le fasi una per riga.
export function CellaFase({ lead, fasi, onScegli }: { lead: RigaLead; fasi: Stage[]; onScegli: (f: Stage) => void }) {
  const [aperta, setAperta] = useState(false);
  const ancora = useRef<HTMLButtonElement>(null);
  const ordinate = [...fasi].sort((a, b) => a.sortOrder - b.sortOrder);
  const nome = fasi.find((f) => f.id === lead.stageId)?.label ?? lead.stageId;
  return (
    <>
      <button ref={ancora} type="button" aria-haspopup="menu" aria-expanded={aperta} aria-label={`Fase di ${lead.company}: ${nome}. Cambia`}
        onClick={() => setAperta((a) => !a)}
        className={cx("group/fase -mx-1.5 flex h-8 w-[calc(100%+12px)] min-w-0 items-center gap-2 rounded-[6px] px-1.5 text-left hover:bg-avorio hover:ring-1 hover:ring-sabbia-2", aperta && "bg-avorio ring-1 ring-ink")}>
        <span className={cx("size-2 shrink-0 rounded-full", classePallino(lead.stageId))} aria-hidden />
        <span title={nome} className="min-w-0 flex-1 truncate">{nome}</span>
        <CaretDown size={12} weight="bold" aria-hidden className={cx("shrink-0 text-grigio opacity-0 group-hover/fase:opacity-100", aperta && "opacity-100")} />
      </button>
      <Tendina ancora={ancora} aperta={aperta} onChiudi={() => setAperta(false)} etichetta={`Fase di ${lead.company}`} larghezza={260}>
        <div role="menu" aria-label={`Fase di ${lead.company}`}>
          {ordinate.map((f) => (
            <VoceTendina key={f.id} scelta={f.id === lead.stageId} onClick={() => { setAperta(false); onScegli(f); }}>
              <span className={cx("size-2 shrink-0 rounded-full", classePallino(f.id))} aria-hidden />
              <span className="min-w-0 truncate">{f.label}</span>
            </VoceTendina>
          ))}
        </div>
      </Tendina>
    </>
  );
}

// Icona di contatto da 32 px (la riga è alta 44): con il telefono è un link, senza resta spenta e dice perché.
function IconaContatto({ href, etichetta, esterno, onAvvio, children }: { href: string | null; etichetta: string; esterno?: boolean; onAvvio: () => void; children: ReactNode }) {
  const base = "inline-flex size-8 shrink-0 items-center justify-center rounded-[8px]";
  if (!href) return <span role="img" aria-label={`${etichetta}: manca il telefono`} title="Manca il telefono" className={cx(base, "text-sabbia-2")}>{children}</span>;
  return (
    <a href={href} aria-label={etichetta} title={etichetta} onClick={onAvvio} target={esterno ? "_blank" : undefined} rel={esterno ? "noreferrer" : undefined}
      className={cx(base, "text-ink transition-colors duration-(--durata-veloce) hover:bg-crema active:bg-sabbia")}>
      {children}
    </a>
  );
}

export function AzioniRiga({ lead, onApri, onCestina }: { lead: RigaLead; onApri: (f: FoglioRiga) => void; onCestina: () => void }) {
  const nonPresentato = useNonPresentato();
  const assenza = callDellAssenza(lead.stageId);
  const wa = modelloPer(useModelli().data, "whatsapp", lead.stageId, "non_ti_ho_trovato");
  const nome = lead.contactName?.trim().split(/\s+/)[0] ?? lead.company;
  return (
    <span className="flex items-center justify-end gap-0.5">
      <IconaContatto href={lead.phone ? linkTel(lead.phone) : null} etichetta={`Chiama ${nome}`} onAvvio={() => avviaContatto(lead.id, "chiamata")}>
        <Phone size={18} weight="bold" aria-hidden />
      </IconaContatto>
      <IconaContatto href={lead.phone ? linkWhatsApp(lead.phone, compila(wa?.body, lead)) : null} etichetta={`WhatsApp a ${nome}`} esterno onAvvio={() => avviaContatto(lead.id, "whatsapp", wa?.id)}>
        <WhatsappLogo size={18} weight="bold" aria-hidden />
      </IconaContatto>
      <MenuPunti piccolo etichetta={`Altre azioni per ${lead.company}`} voci={[
        { testo: "Segna l'esito", onClick: () => onApri({ tipo: "esito", lead }) },
        { testo: "Fissa una call", onClick: () => onApri({ tipo: "fissa", lead }) },
        ...(assenza ? [{ testo: "Non si è presentato", onClick: () => nonPresentato.mutate({ leadId: lead.id, kind: assenza }) }] : []),
        { testo: "Cambia responsabile", onClick: () => onApri({ tipo: "responsabile", lead }) },
        { testo: "Sposta nel cestino", onClick: onCestina, distruttiva: true },
      ]} />
    </span>
  );
}

// Cestino con "Annulla" nel toast (il lead torna com'era).
export function useCestina() {
  const aggiorna = useAggiorna();
  const ripristina = useMutation({
    mutationFn: (id: string) => api(`/leads/${id}/restore`, { method: "POST" }),
    onSuccess: (_r, id) => aggiorna(id),
    onError: (e) => toast.error(e.message),
  });
  return useMutation({
    mutationFn: (lead: RigaLead) => api(`/leads/${lead.id}`, { method: "DELETE" }),
    onSuccess: (_r, lead) => {
      aggiorna(lead.id);
      toast(`${lead.company} nel cestino`, { action: { label: "Annulla", onClick: () => ripristina.mutate(lead.id) } });
    },
    onError: (e) => toast.error(e.message),
  });
}

function FoglioResponsabile({ lead, utenti, onChiudi }: { lead: RigaLead; utenti: { id: string; name: string }[]; onChiudi: () => void }) {
  const aggiorna = useAggiorna();
  const [scelto, setScelto] = useState(lead.ownerId ?? "");
  const nome = utenti.find((u) => u.id === scelto)?.name.split(" ")[0];
  const salva = useMutation({
    mutationFn: () => api(`/leads/${lead.id}`, { method: "PATCH", json: { ownerId: scelto } }),
    onSuccess: () => { aggiorna(lead.id); toast.success(`${lead.company} assegnato a ${nome}`); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  const uguale = scelto === (lead.ownerId ?? "");
  return (
    <Foglio aperto titolo="Cambia responsabile" onChiudi={onChiudi}
      principale={
        <Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} onClick={() => salva.mutate()}
          motivoSpento={!scelto ? "Scegli una persona" : uguale ? "È già il responsabile" : undefined}>
          {nome ? `Assegna a ${nome}` : "Assegna"}
        </Pulsante>
      }>
      <div className="flex flex-col gap-3">
        <p className="text-[15px]">{lead.company}</p>
        <Selettore etichetta="Responsabile" valore={scelto} onCambia={setScelto}
          opzioni={[...(scelto ? [] : [{ valore: "", etichetta: "Scegli" }]), ...utenti.map((u) => ({ valore: u.id, etichetta: u.name }))]} />
      </div>
    </Foglio>
  );
}

// I fogli della riga stanno fuori dalla tabella: uno per volta.
export function FogliRiga({ foglio, utenti, onChiudi }: { foglio: FoglioRiga | null; utenti: { id: string; name: string }[]; onChiudi: () => void }) {
  if (!foglio) return null;
  const { lead } = foglio;
  switch (foglio.tipo) {
    case "esito": return <FoglioEsito lead={lead} onChiudi={onChiudi} />;
    case "fissa": return <FoglioFissaCall leadId={lead.id} haEmail={!!lead.email} onChiudi={onChiudi} />;
    case "responsabile": return <FoglioResponsabile lead={lead} utenti={utenti} onChiudi={onChiudi} />;
    case "fase": {
      const kind = callPerFase(foglio.fase.id);
      return kind
        ? <FoglioFissaCall leadId={lead.id} haEmail={!!lead.email} fase={{ label: foglio.fase.label, kind }} onChiudi={onChiudi} />
        : <FoglioChiusura lead={lead} fase={foglio.fase} onChiudi={onChiudi} />;
    }
  }
}
