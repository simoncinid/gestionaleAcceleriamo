import type { Oggi, VoceAdesso } from "./tipi";

const MEZZORA = 30 * 60_000;

// DS 6.5: la scaduta più vecchia; altrimenti la prossima in scadenza; altrimenti la call entro 30 minuti; altrimenti il primo nuovo.
export function scegliAdesso(o: Pick<Oggi, "nuovi" | "daFare" | "call">, ora: number): VoceAdesso | null {
  const conData = o.daFare.filter((l) => l.nextActionAt != null).sort((a, b) => a.nextActionAt! - b.nextActionAt!);
  const scaduta = conData.find((l) => l.nextActionAt! < ora);
  if (scaduta) return { tipo: "lead", ...scaduta };
  const prossima = conData.find((l) => l.nextActionAt! >= ora);
  if (prossima) return { tipo: "lead", ...prossima };
  const call = [...o.call].sort((a, b) => a.scheduledAt - b.scheduledAt).find((k) => k.scheduledAt >= ora - 15 * 60_000 && k.scheduledAt <= ora + MEZZORA);
  if (call) return { tipo: "call", ...call };
  const nuovo = [...o.nuovi].sort((a, b) => a.createdAt - b.createdAt)[0];
  return nuovo ? { tipo: "lead", ...nuovo } : null;
}
