// Telefono salvato in E.164 (DS 2.2). Senza prefisso si assume l'Italia.
export function aE164(grezzo?: string | null): string | null {
  const t = (grezzo ?? "").trim();
  let cifre = t.replace(/\D/g, "");
  if (cifre.length < 6) return null;
  const conPiu = /^\(?\+/.test(t);
  if (!conPiu && cifre.startsWith("00")) return `+${cifre.slice(2)}`;
  if (conPiu) return `+${cifre}`;
  if (cifre.startsWith("39") && cifre.length >= 11) return `+${cifre}`;
  cifre = cifre.replace(/^0(?=3)/, ""); // "0333..." scritto per sbaglio
  return `+39${cifre}`;
}
