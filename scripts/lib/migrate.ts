import { normalizeEmail, normalizePhone } from "../../worker/lib/normalize";

type Str = string | null | undefined;
export type OldLead = {
  id: string; company?: Str; contactName?: Str; email?: Str; phone?: Str; statusId?: Str; estimatedValue?: number | null; source?: Str;
  notes?: Str; ownerId?: Str; appointmentAt?: Str; meetingLink?: Str; proposalUrl?: Str; lastContactAt?: Str; callNotes?: Str; createdAt?: Str; updatedAt?: Str;
};
export type OldDocument = { id: string; leadId?: Str; clientId?: Str; name?: Str; externalUrl?: Str; objectKey?: Str; uploadedAt?: Str };
export type OldActivity = { id: string; entityType?: Str; entityId?: Str; type?: Str; title?: Str; body?: Str; actorId?: Str; createdAt?: Str };
export type OldDashboard = { leads: OldLead[]; documents?: OldDocument[]; activities?: OldActivity[] };

export const STAGE_IDS = [
  "da-chiamare-prima-volta", "non-chiamato", "da-richiamare", "appuntamento-confermato", "presentazione-confermata",
  "in-attesa-preventivo", "in-attesa-decisione", "probabilmente-bloccato", "chiuso", "non-chiuso", "fuori-target", "fake",
];
const OPEN_STAGE_IDS = STAGE_IDS.slice(0, 8);
export const IMPORTED_NEXT_ACTION = "Riprendere il contatto (importato)";

// Offset (ms) di Europe/Rome rispetto a UTC in un dato istante, indipendente dal fuso della macchina.
function romeOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(utcMs / 1000) * 1000;
}

function ms(frac: string | undefined) {
  return frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
}

export function parseOldDate(v: unknown): number | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  // CURRENT_TIMESTAMP di SQLite: "YYYY-MM-DD HH:MM:SS[.fff]" in UTC
  const sql = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(s);
  if (sql) {
    const t = Date.UTC(+sql[1], +sql[2] - 1, +sql[3], +sql[4], +sql[5], +sql[6], ms(sql[7]));
    return Number.isNaN(t) ? null : t;
  }
  // ISO senza fuso (datetime-local): ora di Roma, con ora legale corretta
  const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/.exec(s);
  if (local) {
    const wall = Date.UTC(+local[1], +local[2] - 1, +local[3], +local[4], +local[5], +(local[6] ?? 0), ms(local[7]));
    if (Number.isNaN(wall)) return null;
    let t = wall - romeOffsetMs(wall);
    t = wall - romeOffsetMs(t);
    return t;
  }
  // ISO con fuso esplicito (Z o ±hh:mm)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

// Una riga per istruzione: gli a capo dentro i testi diventano char(10).
function q(v: unknown): string {
  if (v === null || v === undefined || v === "") return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v)) : "NULL";
  return `'${String(v).replace(/'/g, "''").replace(/\r?\n/g, "' || char(10) || '")}'`;
}

function insert(table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  return `INSERT OR IGNORE INTO ${table} (${keys.join(", ")}) VALUES (${keys.map((k) => q(row[k])).join(", ")});`;
}

export function buildMigrationSql(old: OldDashboard, opts: { now: number; oldBaseUrl: string; userIds: string[] }) {
  const statements: string[] = [];
  const toDownload: { name: string; url: string; company: string }[] = [];
  const counts = { leads: 0, activities: 0, documents: 0 };
  const userOrNull = (id: Str) => (id && opts.userIds.includes(id) ? id : null);
  const companies = new Map<string, string>();

  for (const l of old.leads) {
    const stageId = l.statusId && STAGE_IDS.includes(l.statusId) ? l.statusId : "da-chiamare-prima-volta";
    const isOpen = OPEN_STAGE_IDS.includes(stageId);
    const createdAt = parseOldDate(l.createdAt) ?? opts.now;
    const company = l.company?.trim() || l.contactName?.trim() || "Senza nome";
    companies.set(l.id, company);
    statements.push(
      insert("leads", {
        id: l.id,
        company,
        contact_name: l.contactName,
        email: l.email,
        email_norm: normalizeEmail(l.email),
        phone: l.phone,
        phone_norm: normalizePhone(l.phone),
        source: /meta/i.test(l.source ?? "") ? "meta" : "migrazione",
        stage_id: stageId,
        stage_changed_at: parseOldDate(l.updatedAt) ?? createdAt,
        estimated_value: l.estimatedValue ?? null,
        owner_id: userOrNull(l.ownerId),
        next_action: isOpen ? IMPORTED_NEXT_ACTION : null,
        next_action_at: isOpen ? opts.now : null,
        appointment_at: parseOldDate(l.appointmentAt),
        meet_link: l.meetingLink,
        proposal_url: l.proposalUrl,
        notes: l.notes,
        meta_attempts: 0,
        created_at: createdAt,
        updated_at: parseOldDate(l.updatedAt) ?? createdAt,
      }),
    );
    counts.leads++;
    statements.push(
      insert("activities", {
        id: `mig-${l.id}`,
        lead_id: l.id,
        type: "migrazione",
        body: `Importato dal vecchio gestionale (fonte: ${l.source || "non indicata"})`,
        created_at: createdAt,
      }),
    );
    counts.activities++;
    if (l.callNotes?.trim()) {
      statements.push(
        insert("activities", {
          id: `mig-call-${l.id}`,
          lead_id: l.id,
          type: "chiamata",
          body: `Note delle chiamate dal vecchio gestionale:\n${l.callNotes.trim()}`,
          created_at: parseOldDate(l.lastContactAt) ?? createdAt,
        }),
      );
      counts.activities++;
    }
  }

  for (const a of old.activities ?? []) {
    if (a.entityType !== "lead" || !a.entityId || !companies.has(a.entityId)) continue;
    const body = [a.title, a.body].filter((x) => x && x.trim()).join(": ");
    if (!body) continue;
    statements.push(
      insert("activities", {
        id: `mig-act-${a.id}`,
        lead_id: a.entityId,
        type: "nota",
        body,
        author_id: userOrNull(a.actorId),
        created_at: parseOldDate(a.createdAt) ?? opts.now,
      }),
    );
    counts.activities++;
  }

  for (const d of old.documents ?? []) {
    if (!d.leadId || !companies.has(d.leadId)) continue;
    const name = d.name?.trim() || "Documento";
    let url = d.externalUrl?.trim() || null;
    let shownName = name;
    if (!url && d.objectKey) {
      url = `${opts.oldBaseUrl.replace(/\/$/, "")}/api/documents/${d.id}`;
      shownName = `[da scaricare] ${name}`;
      toDownload.push({ name, url, company: companies.get(d.leadId)! });
    }
    if (!url) continue;
    statements.push(
      insert("documents", { id: `mig-${d.id}`, lead_id: d.leadId, name: shownName, url, created_at: parseOldDate(d.uploadedAt) ?? opts.now }),
    );
    counts.documents++;
  }

  return { statements, counts, toDownload };
}
