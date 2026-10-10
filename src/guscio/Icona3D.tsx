import { Coins, Magnet, Toolbox } from "@phosphor-icons/react";
import { useState } from "react";
import { cx } from "../ds";
import type { Area } from "./aree";

const RIPIEGO = { commerciale: Magnet, economia: Coins, automazioni: Toolbox };

// Icone 3D in public/icone/<area>.webp (84 px, spec 13.1); se il file manca, Phosphor fill (DS 5.2).
// Spente: desaturate come nel prototipo; accese: colore pieno.
export function Icona3D({ area, attiva, misura = 28 }: { area: Area; attiva: boolean; misura?: number }) {
  const [rotta, setRotta] = useState(false);
  if (rotta) {
    const I = RIPIEGO[area];
    return <I size={misura - 4} weight="fill" aria-hidden className={attiva ? "text-accento" : "text-chrome-testo-2"} />;
  }
  return (
    <img src={`/icone/${area}.webp`} alt="" aria-hidden width={misura} height={misura} draggable={false} onError={() => setRotta(true)}
      className={cx("transition-[filter] duration-(--durata-veloce)", !attiva && "[filter:saturate(0.35)_brightness(0.85)]")} />
  );
}
