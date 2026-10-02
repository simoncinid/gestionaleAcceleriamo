export type Access = "none" | "read" | "write";
export type PermissionKey = "leads" | "clients" | "tasks" | "finance" | "jobs" | "team" | "documents";
export type Permissions = Record<PermissionKey, Access>;
export type Role = "admin" | "commerciale" | "sviluppatore" | "finance";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Amministratore",
  commerciale: "Commerciale",
  sviluppatore: "Sviluppatore",
  finance: "Amministrazione",
};

export const ROLE_PRESETS: Record<Role, Permissions> = {
  admin: { leads: "write", clients: "write", tasks: "write", finance: "write", jobs: "write", team: "write", documents: "write" },
  commerciale: { leads: "write", clients: "write", tasks: "write", finance: "read", jobs: "write", team: "none", documents: "write" },
  sviluppatore: { leads: "read", clients: "read", tasks: "write", finance: "none", jobs: "write", team: "none", documents: "read" },
  finance: { leads: "none", clients: "read", tasks: "read", finance: "write", jobs: "read", team: "none", documents: "read" },
};

export function permissionsForRole(role: string): Permissions {
  return { ...(ROLE_PRESETS[(role as Role) in ROLE_PRESETS ? (role as Role) : "commerciale"]) };
}

export function parsePermissions(raw: unknown, role = "commerciale"): Permissions {
  const base = permissionsForRole(role);
  if (typeof raw !== "string" || !raw.trim()) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<Permissions>;
    return { ...base, ...parsed };
  } catch {
    return base;
  }
}

export function can(perms: Permissions, key: PermissionKey, level: Access = "read") {
  const current = perms[key] || "none";
  if (level === "none") return true;
  if (level === "read") return current === "read" || current === "write";
  return current === "write";
}

export const DOC_KINDS = [
  { id: "riassunto", label: "Riassunto call" },
  { id: "proposta", label: "Proposta / Figma" },
  { id: "contratto", label: "Contratto" },
  { id: "fattura", label: "Fattura" },
  { id: "altro", label: "Altro" },
] as const;

export const JOB_STATUSES = [
  { id: "pianificato", label: "Pianificato", tone: "neutral" },
  { id: "in-corso", label: "In corso", tone: "blue" },
  { id: "in-revisione", label: "In revisione", tone: "violet" },
  { id: "in-attesa-cliente", label: "In attesa cliente", tone: "yellow" },
  { id: "completato", label: "Completato", tone: "green" },
  { id: "sospeso", label: "Sospeso", tone: "red" },
] as const;

export const LEAD_SOURCES = ["Meta Ads", "Referral", "Sito web", "LinkedIn", "Manuale", "Altro"] as const;
