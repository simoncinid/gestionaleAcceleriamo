import type { QueryClient } from "@tanstack/react-query";

// Prima ["me"] a null (così App, che lo osserva, si aggiorna), poi si svuota il resto.
export function resetSession(qc: QueryClient) {
  qc.setQueryData(["me"], null);
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
}
