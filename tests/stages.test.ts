import { describe, expect, it } from "vitest";
import { authed, call, createUser } from "./helpers";

type Stages = { stages: { id: string; label: string; sortOrder: number }[] };

describe("fasi e utenti", () => {
  it("rinomina una fase", async () => {
    const cookie = await authed();
    const res = await call("/api/stages/non-chiamato", { method: "PATCH", json: { label: "Non risponde" } }, cookie);
    expect(res.status).toBe(200);
    const list = (await (await call("/api/stages", {}, cookie)).json()) as Stages;
    expect(list.stages.find((s) => s.id === "non-chiamato")?.label).toBe("Non risponde");
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
