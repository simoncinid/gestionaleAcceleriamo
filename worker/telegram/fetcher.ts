// Unico punto da cui partono le chiamate all'API dei bot di Telegram: nei test si sostituisce con un finto.
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
const realFetch: FetchFn = (input, init) => fetch(input, init);
let current = realFetch;
export const telegramFetch: FetchFn = (i, n) => current(i, n);
export function setTelegramFetch(fn: FetchFn | null) {
  current = fn ?? realFetch;
}
