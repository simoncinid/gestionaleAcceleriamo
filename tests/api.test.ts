import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, LOGOUT_REASON_KEY, api } from "../src/api";

const g = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let store: Map<string, string>;
let logoutEvents: number;

function stubFetch(status: number, body: unknown) {
  g.fetch = vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
}

beforeEach(() => {
  for (const k of ["fetch", "window", "sessionStorage"]) saved[k] = g[k];
  store = new Map();
  logoutEvents = 0;
  const win = new EventTarget();
  win.addEventListener("acc:logout", () => logoutEvents++);
  g.window = win;
  g.sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

afterEach(() => {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete g[k];
    else g[k] = saved[k];
  }
});

describe("api", () => {
  it("401 su una pagina normale: motivo salvato ed evento emesso", async () => {
    stubFetch(401, { error: "Non autenticato" });
    await expect(api("/leads")).rejects.toBeInstanceOf(ApiError);
    expect(store.get(LOGOUT_REASON_KEY)).toContain("sessione è scaduta");
    expect(logoutEvents).toBe(1);
  });

  it.each(["/auth/login", "/auth/me", "/auth/logout"])("401 su %s non segnala la scadenza", async (path) => {
    stubFetch(401, { error: "No" });
    await expect(api(path)).rejects.toMatchObject({ status: 401 });
    expect(store.has(LOGOUT_REASON_KEY)).toBe(false);
    expect(logoutEvents).toBe(0);
  });

  it("messaggi di errore", async () => {
    stubFetch(500, { error: "Rotto", errorId: "abc123" });
    await expect(api("/x")).rejects.toThrow("Rotto (codice abc123)");
    stubFetch(400, { error: "Dati non validi" });
    await expect(api("/x")).rejects.toThrow(/^Dati non validi$/);
    stubFetch(502, "<html>bad gateway</html>");
    await expect(api("/x")).rejects.toThrow("Errore 502");
  });
});
