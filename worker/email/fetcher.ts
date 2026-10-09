type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const realFetch: FetchFn = (input, init) => fetch(input, init);
let current: FetchFn = realFetch;

// Le chiamate a Resend passano da qui, così i test possono sostituirle.
export const emailFetch: FetchFn = (input, init) => current(input, init);

export function setEmailFetch(fn: FetchFn | null) {
  current = fn ?? realFetch;
}
