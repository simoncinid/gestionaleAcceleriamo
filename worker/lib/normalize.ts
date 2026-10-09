export function normalizeEmail(v?: string | null): string | null {
  const s = (v ?? "").trim().toLowerCase();
  return s || null;
}

export function normalizePhone(v?: string | null): string | null {
  let d = (v ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("39") && d.length >= 11) d = d.slice(2);
  return d.length >= 6 ? d : null;
}
