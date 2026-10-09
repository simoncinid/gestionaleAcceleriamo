export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export const LOGOUT_REASON_KEY = "acc:logout-reason";

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("content-type", "application/json");
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; errorId?: string };
  if (res.status === 401 && !["/auth/login", "/auth/me", "/auth/logout"].includes(path)) {
    sessionStorage.setItem(LOGOUT_REASON_KEY, "La sessione è scaduta: rientra per continuare. Le modifiche non salvate vanno rifatte.");
    window.dispatchEvent(new Event("acc:logout"));
  }
  if (!res.ok) {
    const message = data.error ? (data.errorId ? `${data.error} (codice ${data.errorId})` : data.error) : `Errore ${res.status}`;
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}
