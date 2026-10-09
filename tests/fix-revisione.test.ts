import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { app } from "../worker/app";
import type { Env } from "../worker/env";
import { authed, call } from "./helpers";

describe("link Meet del lead", () => {
  it("rifiuta javascript: con un messaggio italiano e accetta https", async () => {
    const cookie = await authed();
    const nuovo = await call("/api/leads", { method: "POST", json: { company: "Meet Srl" } }, cookie);
    const id = ((await nuovo.json()) as { lead: { id: string } }).lead.id;
    const cattivo = await call(`/api/leads/${id}`, { method: "PATCH", json: { meetLink: "javascript:alert(1)" } }, cookie);
    expect(cattivo.status).toBe(400);
    expect(((await cattivo.json()) as { error: string }).error).toBe("Il link deve iniziare con http o https");
    const buono = await call(`/api/leads/${id}`, { method: "PATCH", json: { meetLink: "https://meet.google.com/abc" } }, cookie);
    expect(buono.status).toBe(200);
    expect(((await buono.json()) as { lead: { meetLink: string } }).lead.meetLink).toBe("https://meet.google.com/abc");
    const vuoto = await call(`/api/leads/${id}`, { method: "PATCH", json: { meetLink: "" } }, cookie);
    expect(((await vuoto.json()) as { lead: { meetLink: string | null } }).lead.meetLink).toBeNull();
  });
});

describe("R2: la catena del lead nuovo non blocca il salvataggio", () => {
  it("se la catena fallisce il POST risponde 201 con il lead salvato", async () => {
    const cookie = await authed();
    // Dopo l'insert del lead la prima lettura di stage_rules (dentro la catena) fallisce.
    let inserito = false;
    let rotta = false;
    const DB = new Proxy(env.DB, {
      get(t, k) {
        if (k === "prepare") {
          return (q: string) => {
            if (/insert into "?leads"?/i.test(q)) inserito = true;
            if (inserito && !rotta && q.includes("stage_rules")) { rotta = true; throw new Error("D1 finto rotto"); }
            return t.prepare(q);
          };
        }
        const v = Reflect.get(t, k);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const errori = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("https://test.local/api/leads", {
      method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ company: "Catena Rotta Srl" }),
    }), { ...env, DB } as Env, ctx);
    await waitOnExecutionContext(ctx);
    expect(rotta).toBe(true);
    expect(res.status).toBe(201);
    const { lead } = (await res.json()) as { lead: { id: string; company: string } };
    expect(lead.company).toBe("Catena Rotta Srl");
    expect(await env.DB.prepare("SELECT company FROM leads WHERE id = ?").bind(lead.id).first()).toEqual({ company: "Catena Rotta Srl" });
    expect(errori).toHaveBeenCalledWith("catena_lead_nuovo", expect.any(Error));
    errori.mockRestore();
  });
});
