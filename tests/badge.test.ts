import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { inizioGiornoRoma } from "../worker/lib/roma";
import { authed, call } from "./helpers";

const NOW = Date.now();

describe("GET /badge", () => {
  it("conta cose da fare, non cose nuove; un lead conta una volta", async () => {
    const cookie = await authed();
    const ins = (id: string, stage: string, at: number, extra = "") =>
      env.DB.prepare(`INSERT INTO leads (id, company, source, stage_id, stage_changed_at, next_action, next_action_at, created_at, updated_at, owner_id${extra ? ", attempt_count" : ""}) VALUES (?, ?, 'manuale', ?, ?, 'x', ?, ?, ?, 'tommaso'${extra ? ", 1" : ""})`).bind(id, id, stage, NOW, at, NOW, NOW).run();
    await ins("nuovo-e-scaduto", "da-chiamare-prima-volta", NOW - 1000);
    await ins("scaduto", "da-richiamare", NOW - 1000);
    await ins("futuro", "da-richiamare", NOW + 30 * 86_400_000);
    await env.DB.prepare("INSERT INTO clients (id, name, scope, created_at) VALUES ('c1', 'Cliente Prova', 'acceleriamo', 1), ('c2', 'Fuori Prova', 'fuori_perimetro', 1)").run();
    await env.DB.prepare("INSERT INTO invoices (id, client_id, kind, amount_cents, due_at) VALUES ('f1', 'c1', 'canone', 30000, ?), ('f2', 'c2', 'canone', 10000, ?), ('f3', 'c1', 'canone', 30000, ?)").bind(NOW - 86_400_000, NOW - 86_400_000, NOW + 1_000_000).run();
    await env.DB.prepare("INSERT INTO integration_status (key, ok) VALUES ('foglio', 0)").run();
    const b = await (await call("/api/badge", {}, cookie)).json();
    expect(b).toEqual({ commerciale: 2, economia: 1, avvisi: 0, avatar: true });
  });

  it("economia: la fattura che scade oggi non accende il badge, quella scaduta ieri sì (giorno di Roma)", async () => {
    const cookie = await authed();
    const oggi = inizioGiornoRoma(NOW);
    await env.DB.prepare("INSERT INTO clients (id, name, scope, created_at) VALUES ('c1', 'Cliente Prova', 'acceleriamo', 1)").run();
    const fattura = (id: string, dueAt: number) => env.DB.prepare("INSERT INTO invoices (id, client_id, kind, amount_cents, due_at) VALUES (?, 'c1', 'canone', 30000, ?)").bind(id, dueAt).run();
    await fattura("oggi-mezzanotte", oggi);
    await fattura("oggi-poco-fa", NOW - 1000);
    let b = await (await call("/api/badge", {}, cookie)).json<{ economia: number }>();
    expect(b.economia).toBe(0);
    await fattura("ieri", oggi - 1);
    b = await (await call("/api/badge", {}, cookie)).json<{ economia: number }>();
    expect(b.economia).toBe(1);
  });
});
