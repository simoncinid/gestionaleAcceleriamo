export type StatoPush = "non-supportato" | "serve-home" | "da-attivare" | "attivo" | "negato";
// `tocco`: schermo touch con più dita. L'iPad da iPadOS 13 si presenta come "Macintosh" e si riconosce solo così.
export type Ambiente = { ua: string; standalone: boolean; haPush: boolean; permesso: NotificationPermission | "assente"; tocco?: boolean };

export const PERMESSO_NEGATO = "Permesso non concesso";

const IOS = /iPhone|iPad|iPod/;
const eIpad = (ua: string, tocco?: boolean) => /iPad/.test(ua) || (/Macintosh/.test(ua) && tocco === true);

export function statoPush(a: Ambiente, iscritto: boolean): StatoPush {
  if ((IOS.test(a.ua) || eIpad(a.ua, a.tocco)) && !a.standalone) return "serve-home"; // iOS 16.4+: push solo dall'app sulla Home
  if (!a.haPush || a.permesso === "assente") return "non-supportato";
  if (a.permesso === "denied") return "negato";
  if (a.permesso === "granted" && iscritto) return "attivo";
  return "da-attivare";
}

export function etichettaDispositivo(ua: string, tocco?: boolean): string {
  const cosa = /iPhone/.test(ua) ? "iPhone" : eIpad(ua, tocco) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Computer";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${cosa}, ${browser}`;
}

export function ambienteCorrente(): Ambiente {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    ua: nav.userAgent,
    standalone: window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
    haPush: "serviceWorker" in nav && "PushManager" in window,
    permesso: "Notification" in window ? Notification.permission : "assente",
    tocco: (nav.maxTouchPoints ?? 0) > 1,
  };
}

const daB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

// In sviluppo il service worker non si registra: senza un limite l'attesa di ready non finirebbe mai.
function swPronto(ms = 10000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, no) => setTimeout(() => no(new Error("Il servizio delle notifiche non risponde: ricarica la pagina e riprova.")), ms)),
  ]);
}

// Chiamata solo dentro il gestore del tocco: Safari rifiuta il permesso chiesto fuori da un gesto.
export async function attivaPush(chiave: string): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } }> {
  const permesso = await Notification.requestPermission();
  if (permesso !== "granted") throw new Error(PERMESSO_NEGATO);
  const reg = await swPronto();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: daB64u(chiave) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  return { endpoint: j.endpoint, keys: j.keys };
}

// Id della riga in push_subscriptions creata da questo browser. "Attivo" vale solo se quell'id è
// ancora tra i miei dispositivi: così un browser condiviso o una riga rimossa non sembrano attivi.
export const CHIAVE_ID_PUSH = "acc:push-id";

export function leggiIdPush(): string | null {
  try { return globalThis.localStorage?.getItem(CHIAVE_ID_PUSH) ?? null; } catch { return null; }
}

export function salvaIdPush(id: string | null) {
  try {
    if (id) globalThis.localStorage?.setItem(CHIAVE_ID_PUSH, id);
    else globalThis.localStorage?.removeItem(CHIAVE_ID_PUSH);
  } catch { /* archivio non disponibile: resta "da attivare" */ }
}

// Un dispositivo segnato come rotto non conta: il pulsante torna per riattivarlo.
export function iscrittoQui(idSalvato: string | null, dispositivi: { id: string; rotta: boolean }[] | undefined): boolean {
  return !!idSalvato && !!dispositivi?.some((d) => d.id === idSalvato && !d.rotta);
}

// Annulla l'iscrizione del browser: senza, la riattivazione riuserebbe un endpoint che il server ha già dimenticato.
export async function disiscriviBrowser(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  await sub?.unsubscribe();
}
