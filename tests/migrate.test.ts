import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { buildMigrationSql, parseOldDate } from "../scripts/lib/migrate";

const NOW = 1_800_000_000_000;
const old = {
  leads: [
    { id: "o1", company: "Megaron", contactName: "Luca", email: "Info@Megaron.it", phone: "+39 050 123456", statusId: "chiuso", ownerId: "diego",
      source: "Meta Ads", notes: "Cliente", callNotes: "Prima call ok\nSeconda call: firma", lastContactAt: "2026-09-20 10:00:00", createdAt: "2026-09-01 08:00:00" },
    { id: "o2", company: "L'Officina", statusId: "stato-sconosciuto", ownerId: "marco", appointmentAt: "2026-10-12T15:00", createdAt: "2026-10-02T09:00:00.000Z" },
  ],
  documents: [
    { id: "d1", leadId: "o1", name: "Contratto.pdf", objectKey: "docs/d1.pdf" },
    { id: "d2", leadId: "o1", name: "Preventivo", externalUrl: "https://drive.google.com/p" },
    { id: "d3", clientId: "c1", name: "Del cliente", externalUrl: "https://x.it" },
  ],
  activities: [
    { id: "a1", entityType: "lead", entityId: "o1", type: "note", title: "Nota", body: "Richiamare lunedì", actorId: "tommaso", createdAt: "2026-09-10 09:00:00" },
    { id: "a2", entityType: "client", entityId: "c1", type: "note", title: "Altro", body: "x", createdAt: "2026-09-10 09:00:00" },
  ],
};

async function run(statements: string[]) {
  for (const s of statements) await env.DB.prepare(s).run();
}

describe("passaggio dati", () => {
  it("legge le date del prototipo", () => {
    expect(parseOldDate("2026-09-01 08:00:00")).toBe(Date.UTC(2026, 8, 1, 8));
    expect(parseOldDate("2026-10-02T09:00:00.000Z")).toBe(Date.UTC(2026, 9, 2, 9));
    expect(parseOldDate("2026-09-01 08:00:00.123")).toBe(Date.UTC(2026, 8, 1, 8) + 123);
    expect(parseOldDate("2026-10-12T15:00")).toBe(Date.UTC(2026, 9, 12, 13, 0));
    expect(parseOldDate("2026-01-15T15:00")).toBe(Date.UTC(2026, 0, 15, 14, 0));
    expect(parseOldDate("2026-10-12T15:00:00+02:00")).toBe(Date.UTC(2026, 9, 12, 13, 0));
    expect(parseOldDate("")).toBeNull();
    expect(parseOldDate("boh")).toBeNull();
  });

  it("porta lead, storico e documenti, e si può rieseguire", async () => {
    await env.DB.prepare("INSERT INTO users (id, username, name, password_hash, created_at) VALUES ('diego','diego','Diego','x',0), ('tommaso','tommaso','Tommaso','x',0)").run();
    const out = buildMigrationSql(old, { now: NOW, oldBaseUrl: "https://vecchio.example", userIds: ["tommaso", "diego"] });
    expect(out.statements.every((s) => !s.includes("\n"))).toBe(true);
    await run(out.statements);
    await run(out.statements);

    const o1 = await env.DB.prepare("SELECT * FROM leads WHERE id = 'o1'").first<Record<string, unknown>>();
    expect(o1).toMatchObject({ company: "Megaron", stage_id: "chiuso", owner_id: "diego", source: "meta", email_norm: "info@megaron.it",
      phone_norm: "050123456", next_action: null, created_at: Date.UTC(2026, 8, 1, 8) });
    const o2 = await env.DB.prepare("SELECT * FROM leads WHERE id = 'o2'").first<Record<string, unknown>>();
    expect(o2?.appointment_at).toBe(Date.UTC(2026, 9, 12, 13, 0));
    expect(o2).toMatchObject({ company: "L'Officina", stage_id: "da-chiamare-prima-volta", owner_id: null, source: "migrazione",
      next_action: "Riprendere il contatto (importato)", next_action_at: NOW });

    const acts = await env.DB.prepare("SELECT type, body FROM activities WHERE lead_id = 'o1' ORDER BY created_at").all<{ type: string; body: string }>();
    expect(acts.results.map((a) => a.type).sort()).toEqual(["chiamata", "migrazione", "nota"]);
    expect(acts.results.find((a) => a.type === "chiamata")?.body).toContain("Prima call ok\nSeconda call: firma");
    expect(acts.results.find((a) => a.type === "nota")?.body).toBe("Nota: Richiamare lunedì");

    const docs = await env.DB.prepare("SELECT name, url FROM documents ORDER BY name").all<{ name: string; url: string }>();
    expect(docs.results).toEqual([
      { name: "Preventivo", url: "https://drive.google.com/p" },
      { name: "[da scaricare] Contratto.pdf", url: "https://vecchio.example/api/documents/d1" },
    ]);
    expect(out.toDownload).toEqual([{ name: "Contratto.pdf", url: "https://vecchio.example/api/documents/d1", company: "Megaron" }]);
    expect(out.counts).toEqual({ leads: 2, activities: 4, documents: 2 });
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM leads").first<{ n: number }>();
    expect(n?.n).toBe(2);
  });
});
