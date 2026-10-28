import { describe, expect, it } from "vitest";
import { authed, call, createUser } from "./helpers";

type Stages = { stages: { id: string; label: string; sortOrder: number }[] };

describe("fasi e utenti", () => {
  it("il nome di una fase è fisso (blocco 1, modifica 4)", async () => {
    const cookie = await authed();
    const res = await call("/api/stages/da-richiamare", { method: "PATCH", json: { label: "Non risponde" } }, cookie);
    expect(res.status).toBe(422);
    const list = (await (await call("/api/stages", {}, cookie)).json()) as Stages;
    expect(list.stages.find((s) => s.id === "da-richiamare")?.label).not.toBe("Non risponde");
  });

  it("rifiuta una modifica vuota, un tono non valido e una fase inesistente", async () => {
    const cookie = await authed();
    expect((await call("/api/stages/da-richiamare", { method: "PATCH", json: {} }, cookie)).status).toBe(400);
    expect((await call("/api/stages/da-richiamare", { method: "PATCH", json: { tone: "fucsia" } }, cookie)).status).toBe(400);
    expect((await call("/api/stages/non-esiste", { method: "PATCH", json: { probability: 5 } }, cookie)).status).toBe(404);
  });

  it("riordina le fasi", async () => {
    const cookie = await authed();
    const before = (await (await call("/api/stages", {}, cookie)).json()) as Stages;
    const ids = before.stages.map((s) => s.id);
    [ids[0], ids[1]] = [ids[1], ids[0]];
    expect((await call("/api/stages/order", { method: "PUT", json: { ids } }, cookie)).status).toBe(200);
    const after = (await (await call("/api/stages", {}, cookie)).json()) as Stages;
    expect(after.stages.map((s) => s.id)).toEqual(ids);
  });

  it("il riordino deve contenere tutte le fasi", async () => {
    const cookie = await authed();
    const res = await call("/api/stages/order", { method: "PUT", json: { ids: ["chiuso"] } }, cookie);
    expect(res.status).toBe(400);
  });

  it("elenca gli utenti attivi senza dati sensibili", async () => {
    await createUser("diego", "password-lunga-2", "Diego");
    const cookie = await authed();
    const body = (await (await call("/api/users", {}, cookie)).json()) as { users: Record<string, unknown>[] };
    expect(body.users).toEqual([
      { id: "diego", name: "Diego" },
      { id: "tommaso", name: "Tommaso" },
    ]);
  });
});
