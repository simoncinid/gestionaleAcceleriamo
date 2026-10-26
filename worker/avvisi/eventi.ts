import type { EventoAvviso } from "../db/schema";

// Spec 8, tabella degli eventi. Telegram solo per gli eventi con telegram: true (i tre della spec, più i due del risponditore).
export const EVENTI: Record<EventoAvviso, { etichetta: string; chi: "tutti" | "responsabile"; push: boolean; telegram: boolean }> = {
  lead_nuovo: { etichetta: "Lead nuovo", chi: "tutti", push: true, telegram: true },
  sla_90: { etichetta: "Prima chiamata tra 30 minuti", chi: "responsabile", push: true, telegram: false },
  sla_scaduto: { etichetta: "Prima chiamata scaduta", chi: "tutti", push: true, telegram: true },
  proposta_oggi: { etichetta: "Proposta da seguire oggi", chi: "responsabile", push: false, telegram: false },
  fine_pausa: { etichetta: "Fine della pausa", chi: "responsabile", push: false, telegram: false },
  claude_tetto: { etichetta: "Claude al tetto del mese", chi: "tutti", push: true, telegram: true },
  meta_48h: { etichetta: "Meta senza lead da 48 ore", chi: "tutti", push: true, telegram: false },
  integrazione_rotta: { etichetta: "Integrazione rotta", chi: "tutti", push: false, telegram: false },
  risponditore_errore: { etichetta: "Risponditore: messaggio non partito", chi: "tutti", push: true, telegram: true },
  risorsa_richiesta: { etichetta: "Richiesta di chiamata da una risorsa", chi: "tutti", push: true, telegram: true },
  automazione_rotta: { etichetta: "Automazione in errore o ferma", chi: "tutti", push: true, telegram: true },
  mail_da_abbinare: { etichetta: "Invito Meet senza lead", chi: "tutti", push: true, telegram: false },
};
