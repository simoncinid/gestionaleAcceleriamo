export type Env = {
  DB: D1Database;
  ASSETS?: Fetcher;
  META_APP_SECRET: string;
  META_VERIFY_TOKEN: string;
  META_PAGE_TOKEN: string;
  META_GRAPH_VERSION: string;
  // Segreto di produzione (wrangler secret put). Vuoto o assente: gli inviti non partono, la call si salva lo stesso.
  RESEND_API_KEY: string;
  // Chiave dell'aggancio dal wiki (wrangler secret put PROPOSAL_HOOK_KEY). Vuota o assente: l'aggancio risponde sempre 401.
  PROPOSAL_HOOK_KEY: string;
  // Account di servizio Google (wrangler secret put), via alternativa per il Foglio Andrea.
  // Vuoti o assenti: il foglio si legge dal CSV del link condiviso, senza credenziali.
  GOOGLE_SA_EMAIL: string;
  GOOGLE_SA_PRIVATE_KEY: string;
  // Segreti del Piano B (wrangler secret put). Vuoti o assenti: il servizio resta "Non collegato", i lavori aspettano.
  ANTHROPIC_API_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  // Variabili pubbliche (wrangler.jsonc, vars).
  VAPID_PUBLIC_KEY?: string;
  VAPID_SOGGETTO?: string; // "mailto:" o indirizzo dell'app, richiesto da VAPID
  TELEGRAM_BOT?: string; // nome utente del bot, senza @
  // "demo" nello spazio demo (Task 13): niente cron, niente segreti, integrazioni "Spazio demo".
  SPAZIO?: string;
};

export type SessionUser = { id: string; username: string; name: string };

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };
