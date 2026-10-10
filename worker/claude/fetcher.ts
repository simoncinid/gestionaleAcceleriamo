// Unico punto da cui partono le chiamate verso Anthropic: nei test si sostituisce con un finto.
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
const realFetch: FetchFn = (input, init) => fetch(input, init);
let current = realFetch;
export const claudeFetch: FetchFn = (i, n) => current(i, n);
export function setClaudeFetch(fn: FetchFn | null) {
  current = fn ?? realFetch;
}
