import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";

// Rendering lato server dentro il pool Workers: basta per classi, testi, aria e conteggi.
export function render(el: ReactElement, opzioni: { percorso?: string; rotta?: string; dati?: [unknown[], unknown][]; errori?: [unknown[], Error][] } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [chiave, valore] of opzioni.dati ?? []) qc.setQueryData(chiave, valore);
  // Una query già fallita: serve per gli stati di errore delle pagine.
  for (const [chiave, errore] of opzioni.errori ?? []) {
    qc.setQueryDefaults(chiave, { retryOnMount: false });
    qc.getQueryCache().build(qc, { queryKey: chiave }).setState({ status: "error", error: errore, fetchStatus: "idle" });
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[opzioni.percorso ?? "/"]}>
        {opzioni.rotta ? <Routes><Route path={opzioni.rotta} element={el} /></Routes> : el}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const contaPrimari = (html: string) => (html.match(/data-variante="(primario|su-accento)"/g) ?? []).length;
