import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

// Spec 12: avviso fisso in testata nello spazio demo. Fuori dalla demo non occupa spazio.
// Non è un'azione: niente arancione pieno (riservato al primario), solo una riga d'avviso.
export function BannerDemo() {
  const q = useQuery({ queryKey: ["spazio"], queryFn: () => api<{ demo: boolean }>("/spazio"), staleTime: Infinity });
  if (!q.data?.demo) return null;
  return <p role="status" data-banner-demo className="border-b border-sabbia bg-tinta px-4 py-1.5 text-center text-meta font-semibold text-accento-testo">Spazio demo, dati finti</p>;
}
