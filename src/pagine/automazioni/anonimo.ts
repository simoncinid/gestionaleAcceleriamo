import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router";

let anonimo = false;
const ascolti = new Set<() => void>();

export function setAnonimo(v: boolean) {
  anonimo = v;
  for (const f of ascolti) f();
}

const iscrivi = (f: () => void) => {
  ascolti.add(f);
  return () => void ascolti.delete(f);
};

export const useAnonimo = () => useSyncExternalStore(iscrivi, () => anonimo, () => anonimo);

// Spec 10.1: l'anonimo vale finché si resta nell'area Automazioni. Il Guscio lo spegne appena si esce.
export function useAzzeraAnonimoFuoriArea() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!pathname.startsWith("/automazioni")) setAnonimo(false);
  }, [pathname]);
}
