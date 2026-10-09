export type StatoPush = "non-supportato" | "serve-home" | "da-attivare" | "attivo" | "negato";
export type Ambiente = { ua: string; standalone: boolean; haPush: boolean; permesso: NotificationPermission | "assente" };

const IOS = /iPhone|iPad|iPod/;

export function statoPush(a: Ambiente, iscritto: boolean): StatoPush {
  if (IOS.test(a.ua) && !a.standalone) return "serve-home"; // iOS 16.4+: push solo dall'app sulla Home
  if (!a.haPush || a.permesso === "assente") return "non-supportato";
  if (a.permesso === "denied") return "negato";
  if (a.permesso === "granted" && iscritto) return "attivo";
  return "da-attivare";
}

export function etichettaDispositivo(ua: string): string {
  const cosa = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Computer";
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
  };
}

const daB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

// In sviluppo il service worker non si registra: senza un limite l'attesa di ready non finirebbe mai.
function swPronto(ms = 10000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, no) => setTimeout(() => no(new Error("Il service worker non è pronto")), ms)),
  ]);
}

// Chiamata solo dentro il gestore del tocco: Safari rifiuta il permesso chiesto fuori da un gesto.
export async function attivaPush(chiave: string): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } }> {
  const permesso = await Notification.requestPermission();
  if (permesso !== "granted") throw new Error("Permesso non concesso");
  const reg = await swPronto();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: daB64u(chiave) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  return { endpoint: j.endpoint, keys: j.keys };
}

// Al ritorno sulla pagina: se il browser ha già un'iscrizione e il permesso, il dispositivo risulta attivo.
export async function iscrizioneEsistente(): Promise<string | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub?.endpoint ?? null;
}
