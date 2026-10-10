import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api";
import { AttivaNotifiche, messaggioErroreAttiva, rimuoviDispositivo } from "../src/pagine/impostazioni/AttivaNotifiche";
import { CHIAVE_ID_PUSH, iscrittoQui, PERMESSO_NEGATO } from "../src/push";
import { render } from "./render";

const MAC = { ua: "Macintosh Chrome/129", standalone: false, haPush: true, permesso: "granted" as const };
const riga = (id: string, rotta = false) => ({ id, etichetta: "Mac, Chrome", createdAt: 1, lastOkAt: null, rotta });
const dati = (dispositivi: unknown[]): [unknown[], unknown][] => [[["push-chiave"], { chiave: "BAAA" }], [["push-dispositivi"], { dispositivi }]];

// Archivio finto del browser: nel pool Workers localStorage non c'è.
let archivio: Map<string, string>;
beforeEach(() => {
  archivio = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => archivio.get(k) ?? null,
    setItem: (k: string, v: string) => void archivio.set(k, v),
    removeItem: (k: string) => void archivio.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("dispositivo in uso", () => {
  it("attivo solo se l'id salvato è tra i miei dispositivi", async () => {
    archivio.set(CHIAVE_ID_PUSH, "mio");
    const html = await render(<AttivaNotifiche ambiente={MAC} />, { dati: dati([riga("mio")]) });
    expect(html).toContain("Le notifiche sono attive su questo dispositivo");
    expect(html).toContain("questo dispositivo");
    expect(html).not.toContain("Attiva le notifiche su questo dispositivo");
  });
  it("id salvato assente dall'elenco (altro utente, rimosso, 410): non attivo, pulsante presente", async () => {
    archivio.set(CHIAVE_ID_PUSH, "mio");
    const html = await render(<AttivaNotifiche ambiente={MAC} />, { dati: dati([riga("di-un-altro")]) });
    expect(html).toContain("Attiva le notifiche su questo dispositivo");
    expect(html).not.toContain("Le notifiche sono attive");
  });
  it("dispositivo in uso segnato come rotto: si può riattivare", () => {
    expect(iscrittoQui("mio", [riga("mio", true)])).toBe(false);
    expect(iscrittoQui("mio", [riga("mio")])).toBe(true);
    expect(iscrittoQui(null, [riga("mio")])).toBe(false);
  });
  it("rimuovere il dispositivo in uso disiscrive il browser e riporta il pulsante Attiva", async () => {
    archivio.set(CHIAVE_ID_PUSH, "mio");
    const disiscrivi = vi.fn(async () => undefined);
    const cancella = vi.fn(async () => ({ ok: true }));
    const esito = await rimuoviDispositivo("mio", {
      cancella, disiscrivi,
      idSalvato: () => archivio.get(CHIAVE_ID_PUSH) ?? null,
      salva: (id) => (id ? archivio.set(CHIAVE_ID_PUSH, id) : archivio.delete(CHIAVE_ID_PUSH)),
    });
    expect(esito.eraQuesto).toBe(true);
    expect(cancella).toHaveBeenCalledWith("mio");
    expect(disiscrivi).toHaveBeenCalledOnce();
    expect(archivio.has(CHIAVE_ID_PUSH)).toBe(false);
    const html = await render(<AttivaNotifiche ambiente={MAC} />, { dati: dati([]) });
    expect(html).toContain("Attiva le notifiche su questo dispositivo");
  });
  it("rimuovere un altro dispositivo non tocca il browser", async () => {
    archivio.set(CHIAVE_ID_PUSH, "mio");
    const disiscrivi = vi.fn(async () => undefined);
    const esito = await rimuoviDispositivo("altro", { cancella: async () => ({}), disiscrivi, idSalvato: () => archivio.get(CHIAVE_ID_PUSH) ?? null, salva: () => archivio.clear() });
    expect(esito.eraQuesto).toBe(false);
    expect(disiscrivi).not.toHaveBeenCalled();
    expect(archivio.get(CHIAVE_ID_PUSH)).toBe("mio");
  });
  it("errore del server nella rimozione: arriva al chiamante (toast), niente disiscrizione", async () => {
    const disiscrivi = vi.fn(async () => undefined);
    await expect(rimuoviDispositivo("mio", { cancella: async () => { throw new ApiError(500, "Dispositivo non rimosso"); }, disiscrivi, idSalvato: () => "mio", salva: () => undefined }))
      .rejects.toThrow("Dispositivo non rimosso");
    expect(disiscrivi).not.toHaveBeenCalled();
  });
});

describe("messaggi di errore dell'attivazione", () => {
  it("errore del server: il messaggio del server", () => {
    expect(messaggioErroreAttiva(new ApiError(400, "L'indirizzo del servizio push deve iniziare con https"))).toBe("L'indirizzo del servizio push deve iniziare con https");
  });
  it("service worker che non risponde: il suo messaggio", () => {
    expect(messaggioErroreAttiva(new Error("Il servizio delle notifiche non risponde: ricarica la pagina e riprova."))).toContain("non risponde");
  });
  it("permesso negato: il messaggio sul permesso del browser", () => {
    expect(messaggioErroreAttiva(new Error(PERMESSO_NEGATO))).toBe("Le notifiche non si sono attivate. Controlla il permesso del browser.");
  });
});
