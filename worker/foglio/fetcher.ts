type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const realFetch: FetchFn = (input, init) => fetch(input, init);
let current: FetchFn = realFetch;

// Le chiamate a Google (CSV del link, token e API Sheets) passano da qui, così i test le sostituiscono.
export const googleFetch: FetchFn = (input, init) => current(input, init);

export function setGoogleFetch(fn: FetchFn | null) {
  current = fn ?? realFetch;
}
