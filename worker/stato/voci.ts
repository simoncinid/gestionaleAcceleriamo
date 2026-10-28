import type { Lavoro } from "../cron";
import type { Env } from "../env";
import { pushCollegate } from "../push/invio";

// Lavori del giro nella pagina Stato: nome in parole semplici, intervallo atteso in minuti e, se serve,
// quando il lavoro è spento perché manca la configurazione (il giro gira lo stesso, ma non fa niente).
export const VOCI_GIRO: Record<Lavoro, { nome: string; intervalloMin: number; spento?: (env: Env) => boolean }> = {
  foglio: { nome: "Lead dal foglio di Andrea", intervalloMin: 5 },
  meta: { nome: "Lead Meta: dati del modulo", intervalloMin: 15, spento: (e) => !e.META_PAGE_TOKEN },
  meta_recupero: { nome: "Lead Meta: recupero ogni 15 minuti", intervalloMin: 15, spento: (e) => !e.META_PAGE_TOKEN || !e.META_PAGE_ID },
  avvisi: { nome: "Avvisi in app", intervalloMin: 5 },
  risponditore: { nome: "Risponditore Instagram", intervalloMin: 15, spento: (e) => !e.IG_TOKEN_KEY },
  ig_token: { nome: "Rinnovo del token Instagram", intervalloMin: 1440, spento: (e) => !e.IG_TOKEN_KEY },
  consegna: { nome: "Notifiche sul telefono", intervalloMin: 5, spento: (e) => !pushCollegate(e) },
  telegram: { nome: "Messaggi Telegram", intervalloMin: 5, spento: (e) => !e.TELEGRAM_BOT_TOKEN },
  conferme: { nome: "Email di conferma e inviti", intervalloMin: 5, spento: (e) => !e.RESEND_API_KEY },
  meta_48h: { nome: "Controllo Meta senza lead da 48 ore", intervalloMin: 60, spento: (e) => !e.META_PAGE_TOKEN },
  lavori: { nome: "Task ricorrenti dei lavori", intervalloMin: 1440 },
  cestino: { nome: "Cestino dei lead oltre 30 giorni", intervalloMin: 1440 },
  lunedi: { nome: "Revisione del lunedì", intervalloMin: 10_080 },
  claude: { nome: "Lavori di Claude", intervalloMin: 5, spento: (e) => !e.ANTHROPIC_API_KEY },
  proposte_scadute: { nome: "Preventivi scaduti", intervalloMin: 1440 },
  stato: { nome: "Controllo dello stato delle automazioni", intervalloMin: 15 },
};

export const idVoceGiro = (lavoro: Lavoro) => `giro:${lavoro}`;

// Il giro intero (ogni 5 minuti): se si ferma il cron diventano gialle tutte le voci, questa per prima.
export const VOCE_GIRO = "giro";
export const GIRO = { nome: "Giro programmato", intervalloMin: 5 };

// Il webhook dei lead Meta: non ha un intervallo (arriva quando arriva un lead), quindi non diventa mai giallo.
// Verde dopo un lead ricevuto, rosso dopo una firma o un corpo non validi (worker/meta/routes.ts).
export const VOCE_WEBHOOK_META = "meta_webhook";
export const WEBHOOK_META = { nome: "Lead Meta: webhook", intervalloMin: null };
