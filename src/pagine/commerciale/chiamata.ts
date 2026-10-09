import { useEffect, useRef } from "react";
import { api } from "../../api";

const CHIAVE = "acc:chiamata-in-corso";
const VALIDA_PER = 2 * 3_600_000;
export type Archivio = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function segnaChiamata(a: Archivio, leadId: string, ora = Date.now()) {
  a.setItem(CHIAVE, JSON.stringify({ leadId, at: ora }));
}

// Si legge una volta sola: al secondo ritorno il foglio non si riapre.
export function riprendiChiamata(a: Archivio, ora = Date.now()): string | null {
  const grezzo = a.getItem(CHIAVE);
  a.removeItem(CHIAVE);
  if (!grezzo) return null;
  try {
    const { leadId, at } = JSON.parse(grezzo) as { leadId: string; at: number };
    return ora - at <= VALIDA_PER ? leadId : null;
  } catch {
    return null;
  }
}

// Spec 6.4, passo 2: al ritorno nell'app si apre da solo il Foglio Esito.
// La funzione sta in un ref: l'ascoltatore si registra una volta sola e chiama sempre la versione più recente.
export function useRitornoChiamata(onRitorno: (leadId: string) => void) {
  const ultimo = useRef(onRitorno);
  useEffect(() => {
    ultimo.current = onRitorno;
  });
  useEffect(() => {
    const controlla = () => {
      if (document.visibilityState !== "visible") return;
      const id = riprendiChiamata(sessionStorage);
      if (id) ultimo.current(id);
    };
    document.addEventListener("visibilitychange", controlla);
    return () => document.removeEventListener("visibilitychange", controlla);
  }, []);
}

// Contatto avviato da un pulsante (chiamata, WhatsApp, email): finisce nello storico, il modello si passa sempre per id.
// La chiamata si segna anche qui, per riaprire il Foglio Esito al ritorno.
export function avviaContatto(leadId: string, canale: "chiamata" | "whatsapp" | "email", modello?: string) {
  if (canale === "chiamata") segnaChiamata(sessionStorage, leadId);
  void api(`/leads/${leadId}/contatti`, { method: "POST", json: { canale, ...(modello ? { modello } : {}) } }).catch(() => undefined);
}
