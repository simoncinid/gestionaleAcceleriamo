import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { catenaLeadNuovo } from "../worker/regole/catena";
import { authed, call, createUser } from "./helpers";

async function lead(id: string) {
  return env.DB.prepare("SELECT owner_id, score, phone FROM leads WHERE id = ?").bind(id).first<{ owner_id: string | null; score: string | null; phone: string | null }>();
}

describe("catena del lead nuovo", () => {
  it("un lead a mano prende responsabile, punteggio e telefono in E.164", async () => {
    const cookie = await authed();
    await createUser("diego", "password-lunga-2", "Diego");
    const res = await call("/api/leads", { method: "POST", json: { company: "Officina Prova", phone: "333 000 0001", email: "luca@officina-prova.it", website: "officina-prova.it" } }, cookie);
    const { lead: creato } = (await res.json()) as { lead: { id: string } };
    expect(await lead(creato.id)).toEqual({ owner_id: "tommaso", score: "verde", phone: "+393330000001" });
  });

  it("se chi fa la prima chiamata è via, il lead va all'altro", async () => {
    const cookie = await authed();
    await createUser("diego", "password-lunga-2", "Diego");
    await call("/api/settings", { method: "PUT", json: { key: "assegnazione", value: { primaChiamata: "tommaso", presentazione: "diego", proposta: "diego", via: { utente: "tommaso", fino: Date.now() + 86_400_000 } } } }, cookie);
    const res = await call("/api/leads", { method: "POST", json: { company: "Bar Prova" } }, cookie);
    const { lead: creato } = (await res.json()) as { lead: { id: string } };
    expect((await lead(creato.id))?.owner_id).toBe("diego");
  });

  it("il responsabile scelto a mano non si tocca", async () => {
    const cookie = await authed();
    await createUser("diego", "password-lunga-2", "Diego");
    const res = await call("/api/leads", { method: "POST", json: { company: "Forno Prova", ownerId: "diego" } }, cookie);
    const { lead: creato } = (await res.json()) as { lead: { id: string } };
    expect((await lead(creato.id))?.owner_id).toBe("diego");
  });

  it("modificando il telefono si salva in E.164, i doppioni restano sul numero normalizzato", async () => {
    const cookie = await authed();
    const a = (await (await call("/api/leads", { method: "POST", json: { company: "Uno Prova", phone: "333 111 2222" } }, cookie)).json()) as { lead: { id: string } };
    const b = (await (await call("/api/leads", { method: "POST", json: { company: "Due Prova" } }, cookie)).json()) as { lead: { id: string; duplicateOfId: string | null } };
    const res = await call(`/api/leads/${b.lead.id}`, { method: "PATCH", json: { phone: "+39 3331112222" } }, cookie);
    const { lead: dopo } = (await res.json()) as { lead: { phone: string; duplicateOfId: string | null } };
    expect(dopo.phone).toBe("+393331112222");
    expect(dopo.duplicateOfId).toBe(a.lead.id);
  });

  it("con tre utenti, se chi chiama è via va a chi fa la presentazione, poi al primo per nome", async () => {
    const cookie = await authed();
    await createUser("zeno", "password-lunga-3", "Zeno");
    await createUser("diego", "password-lunga-2", "Diego");
    await createUser("anna", "password-lunga-4", "Anna");
    const via = { utente: "tommaso", fino: Date.now() + 86_400_000 };
    await call("/api/settings", { method: "PUT", json: { key: "assegnazione", value: { primaChiamata: "tommaso", presentazione: "diego", proposta: "diego", via } } }, cookie);
    const uno = (await (await call("/api/leads", { method: "POST", json: { company: "Uno Prova" } }, cookie)).json()) as { lead: { id: string } };
    expect((await lead(uno.lead.id))?.owner_id).toBe("diego");
    await env.DB.prepare("UPDATE users SET active = 0 WHERE id = 'diego'").run();
    const due = (await (await call("/api/leads", { method: "POST", json: { company: "Due Prova" } }, cookie)).json()) as { lead: { id: string } };
    expect((await lead(due.lead.id))?.owner_id).toBe("anna");
  });
});

describe("avviso Lead nuovo dalla catena", () => {
  const avvisi = async (id: string) => (await env.DB.prepare("SELECT user_id FROM notifications WHERE evento = 'lead_nuovo' AND entity_id = ? ORDER BY user_id").bind(id).all()).results;
  async function nuovo(id: string, source: string) {
    await env.DB.prepare("INSERT INTO leads (id, company, source, stage_id, stage_changed_at, created_at, updated_at) VALUES (?, 'Officina Prova', ?, 'da-chiamare-prima-volta', 1, 1, 1)").bind(id, source).run();
  }
  it("foglio e Meta avvisano tutti e due, il lead a mano nessuno", async () => {
    await createUser();
    await createUser("diego", "password-lunga-2", "Diego");
    await nuovo("F1", "foglio_andrea");
    await nuovo("M1", "meta");
    await nuovo("A1", "manuale");
    await catenaLeadNuovo(env, "F1", "foglio", 1000);
    await catenaLeadNuovo(env, "M1", "meta", 1000);
    await catenaLeadNuovo(env, "A1", "manuale", 1000);
    expect(await avvisi("F1")).toEqual([{ user_id: "diego" }, { user_id: "tommaso" }]);
    expect(await avvisi("M1")).toEqual([{ user_id: "diego" }, { user_id: "tommaso" }]);
    expect(await avvisi("A1")).toEqual([]);
  });
});
