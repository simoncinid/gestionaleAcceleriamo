// Badge del Commerciale (contratto blocco 1, sezione 5): il numero intero, lo stesso del titolo di Oggi con "Miei".
// Niente "9+": se il titolo dice 12, il menu dice 12. A zero non c'è. Stesso aspetto del Badge del design system.
export function BadgeIntero({ n, etichetta }: { n: number; etichetta: string }) {
  if (n <= 0) return null;
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accento px-1.5 text-etichetta font-semibold text-accento-inchiostro tabular-nums">
      {n}<span className="sr-only"> {etichetta}</span>
    </span>
  );
}
