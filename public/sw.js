// Spec 8.3 e 17: in cache solo il guscio statico, mai le API.
const VERSIONE = "guscio-v1";
const GUSCIO = ["/offline.html", "/manifest.webmanifest", "/app/icona-192.png", "/fonts/DegularDisplay-Semibold.otf", "/fonts/Inter-Regular.ttf"];
const STATICI = ["/assets/", "/fonts/", "/icone/", "/brand/", "/app/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(GUSCIO)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(chiavi.filter((k) => k !== VERSIONE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  if (STATICI.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      caches.match(req).then((trovato) => trovato || fetch(req).then((r) => {
        // Il ripiego della SPA risponde 200 con index.html anche per un file che non esiste: quello non si salva.
        const html = (r.headers.get("content-type") || "").includes("text/html");
        if (r.ok && !html) {
          const copia = r.clone();
          caches.open(VERSIONE).then((c) => c.put(req, copia));
        }
        return r;
      })),
    );
  }
});

self.addEventListener("push", (event) => {
  let dati = { titolo: "Acceleriamo OS", testo: "", href: "/commerciale/oggi", tag: undefined };
  try { dati = { ...dati, ...event.data.json() }; } catch (e) {}
  event.waitUntil(self.registration.showNotification(dati.titolo, {
    body: dati.testo,
    tag: dati.tag,
    icon: "/app/icona-192.png",
    badge: "/app/icona-192.png",
    data: { href: dati.href },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/commerciale/oggi";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((finestre) => {
      const aperta = finestre.find((f) => new URL(f.url).origin === self.location.origin);
      if (!aperta) return self.clients.openWindow(href);
      // navigate() funziona solo su una finestra controllata dal service worker: altrimenti se ne apre una nuova.
      return aperta.focus().then((f) => f.navigate(href)).catch(() => self.clients.openWindow(href));
    }),
  );
});
