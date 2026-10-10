import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { call, createUser, loginCookie } from "./helpers";

let cookie = "";
beforeEach(async () => {
  await createUser("tommaso", "password-lunga-1", "Tommaso Rovini");
  cookie = await loginCookie("tommaso", "password-lunga-1");
  await env.DB.prepare(`INSERT INTO leads (id, company, contact_name, source, stage_id, stage_changed_at, created_at, updated_at, deleted_at) VALUES
    ('L1', 'Officina Bertini', 'Marco', 'meta', 'da-richiamare', 0, 0, 0, NULL),
    ('L2', 'Bertini nel cestino', NULL, 'meta', 'da-richiamare', 0, 0, 0, 5),
    ('L3', 'Sconto 100%', NULL, 'meta', 'da-richiamare', 0, 0, 0, NULL)`).run();
  await env.DB.prepare("INSERT INTO proposals (id, lead_id, number, company, status, registered_via, created_at, updated_at) VALUES ('P1', 'L1', 'ACC-2026-014', 'Officina Bertini', 'registrata', 'manuale', 0, 0)").run();
});

describe("GET /api/search", () => {
  it("trova lead e proposte, salta il cestino", async () => {
    const r = await (await call("/api/search?q=bertini", {}, cookie)).json<{ lead: { id: string; href: string }[]; proposte: { id: string }[] }>();
    expect(r.lead.map((x) => x.id)).toEqual(["L1"]);
    expect(r.lead[0].href).toBe("/commerciale/lead/L1");
    expect(r.proposte.map((x) => x.id)).toEqual(["P1"]);
  });
  it("il % è un carattere, non un jolly; sotto 2 lettere niente", async () => {
    const r = await (await call("/api/search?q=%25", {}, cookie)).json<{ lead: unknown[] }>();
    expect(r.lead).toEqual([]);
    const s = await (await call(`/api/search?q=${encodeURIComponent("0%")}`, {}, cookie)).json<{ lead: { id: string }[] }>();
    expect(s.lead.map((x) => x.id)).toEqual(["L3"]);
  });
  it("401 senza sessione", async () => {
    expect((await call("/api/search?q=ab")).status).toBe(401);
  });
});

describe("GET /api/search: automazioni e fatture", () => {
  it("cerca per nome del cliente, fatture verso la pagina Fatture", async () => {
    await env.DB.prepare("INSERT INTO clients (id, name, created_at) VALUES ('C1', 'Bertini Spa', 0)").run();
    await env.DB.prepare("INSERT INTO invoices (id, client_id, kind, number, amount_cents) VALUES ('I1', 'C1', 'canone', '7/2026', 100)").run();
    const r = await (await call("/api/search?q=bertini", {}, cookie)).json<{ fatture: { titolo: string; meta: string; href: string }[] }>();
    expect(r.fatture).toEqual([{ id: "I1", titolo: "Fattura 7/2026", meta: "Bertini Spa", href: "/economia/fatture" }]);
  });
  it("underscore e % in mezzo sono caratteri, non jolly", async () => {
    for (const q of ["o_1", "i%B"]) {
      const r = await (await call(`/api/search?q=${encodeURIComponent(q)}`, {}, cookie)).json<{ lead: unknown[] }>();
      expect({ q, lead: r.lead }).toEqual({ q, lead: [] });
    }
  });
});
