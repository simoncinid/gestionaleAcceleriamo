export function Skeleton({ righe = 4 }: { righe?: number }) {
  return (
    <div aria-busy="true" aria-label="Caricamento" className="flex flex-col gap-3">
      {Array.from({ length: righe }, (_, i) => <div key={i} className="skeleton h-[60px] rounded-blocco" />)}
    </div>
  );
}
