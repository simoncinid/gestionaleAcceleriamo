import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { contaD1 } from "../worker/lib/bilancio";
import { getDb } from "../worker/db/client";
import { users } from "../worker/db/schema";

describe("contaD1", () => {
  it("conta ogni esecuzione, anche attraverso Drizzle", async () => {
    const c = { query: 0 };
    const db = contaD1(env.DB, c);
    await db.prepare("SELECT 1").first();
    await db.prepare("SELECT ?1").bind(2).all();
    await getDb(db).select().from(users).limit(1);
    expect(c.query).toBe(3);
  });

  it("una batch conta quanti statement contiene", async () => {
    const c = { query: 0 };
    const db = contaD1(env.DB, c);
    await db.batch([db.prepare("SELECT 1"), db.prepare("SELECT 2"), db.prepare("SELECT 3")]);
    expect(c.query).toBe(3);
  });

  it("le proprietà che non eseguono non contano", async () => {
    const c = { query: 0 };
    const db = contaD1(env.DB, c);
    db.prepare("SELECT 1").bind();
    expect(c.query).toBe(0);
  });
});
