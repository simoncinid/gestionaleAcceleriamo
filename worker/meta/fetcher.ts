type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const realFetch: FetchFn = (input, init) => fetch(input, init);
let current: FetchFn = realFetch;

// Le chiamate alla Graph API passano da qui, così i test possono sostituirle.
export const metaFetch: FetchFn = (input, init) => current(input, init);

export function setMetaFetch(fn: FetchFn | null) {
  current = fn ?? realFetch;
}
