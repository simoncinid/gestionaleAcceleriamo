// Unico punto da cui partono le push verso i servizi dei browser: nei test si sostituisce con un finto.
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
const realFetch: FetchFn = (input, init) => fetch(input, init);
let current = realFetch;
export const pushFetch: FetchFn = (i, n) => current(i, n);
export function setPushFetch(fn: FetchFn | null) {
  current = fn ?? realFetch;
}
