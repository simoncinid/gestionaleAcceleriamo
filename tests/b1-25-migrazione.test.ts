import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

// Blocco 1, modifica 25: migrazione 0020 (percorso di vendita a cinque chiamate).
const NOW = 1_800_000_000_000;

async function inserisci(tabella: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO ${tabella} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}

// Le query della 0020 che toccano i dati (UPDATE), da rieseguire sui dati scritti dalla prova.
async function rieseguiAggiornamenti() {
  const mig = env.TEST_MIGRATIONS.find((m) => m.name.startsWith("0020"))!;
  for (const q of mig.queries.filter((q) => /^\s*(--[^\n]*\n\s*)*UPDATE (calls|activities)/.test(q))) await env.DB.prepare(q).run();
}

describe("migrazione 0020: percorso a cinque chiamate", () => {
  it("dodici fasi in ordine, con etichette e colori del contratto", async () => {
    const { results } = await env.DB.prepare("SELECT id, label, sort_order, kind, tone FROM stages ORDER BY sort_order").all<{ id: string; label: string; sort_order: number; kind: string; tone: string }>();
    expect(results.map((s) => [s.sort_order, s.id, s.label, s.tone])).toEqual([
      [10, "da-chiamare-prima-volta", "Nuovo, da chiamare", "orange"],
      [20, "da-richiamare", "Da richiamare", "orange"],
      [30, "appuntamento-confermato", "Conoscenza fissata", "blue"],
      [35, "in-attesa-preventivo", "In attesa offerta", "orange"],
      [40, "presentazione-confermata", "Offerta fissata", "blue"],
      [45, "analisi-fissata", "Analisi fissata", "blue"],
      [50, "in-attesa-progetto", "In attesa progetto", "orange"],
      [55, "progetto-fissato", "Progetto fissato", "blue"],
      [60, "in-attesa-decisione", "In attesa decisione", "yellow"],
      [70, "chiuso", "Cliente", "green"],
      [80, "non-chiuso", "Non interessato", "neutral"],
      [90, "fake", "Non profilato", "neutral"],
    ]);
    expect(results.filter((s) => ["analisi-fissata", "in-attesa-progetto", "progetto-fissato"].includes(s.id)).every((s) => s.kind === "open")).toBe(true);
  });

  it("le call di presentazione diventano call dell'offerta", async () => {
    await inserisci("leads", { id: "l1", company: "A", source: "manuale", stage_id: "presentazione-confermata", stage_changed_at: NOW, created_at: NOW, updated_at: NOW });
    await inserisci("calls", { id: "k1", lead_id: "l1", kind: "presentazione", scheduled_at: NOW, created_at: NOW, updated_at: NOW });
    await inserisci("calls", { id: "k2", lead_id: "l1", kind: "conoscenza", scheduled_at: NOW, created_at: NOW, updated_at: NOW });
    await rieseguiAggiornamenti();
    const { results } = await env.DB.prepare("SELECT id, kind FROM calls ORDER BY id").all();
    expect(results).toEqual([{ id: "k1", kind: "offerta" }, { id: "k2", kind: "conoscenza" }]);
  });

  it("i codici esito salvati prendono i nomi nuovi", async () => {
    await inserisci("leads", { id: "l2", company: "B", source: "manuale", stage_id: "da-richiamare", stage_changed_at: NOW, created_at: NOW, updated_at: NOW });
    const vecchi = ["appuntamento", "consulenza_fatta", "presentazione_fissata", "presentazione_fatta", "non_risponde"];
    for (const [i, outcome] of vecchi.entries()) await inserisci("activities", { id: `a${i}`, lead_id: "l2", type: "esito", body: "x", created_at: NOW, outcome });
    await rieseguiAggiornamenti();
    const { results } = await env.DB.prepare("SELECT outcome FROM activities WHERE lead_id = 'l2' ORDER BY id").all<{ outcome: string }>();
    expect(results.map((r) => r.outcome)).toEqual(["conoscenza_fissata", "conoscenza_fatta", "offerta_fissata", "offerta_presentata", "non_risponde"]);
  });

  it("la proposta ha le colonne della forbice", async () => {
    await inserisci("proposals", { id: "p1", number: "P-1", status: "bozza", registered_via: "manuale", created_at: NOW, updated_at: NOW, forbice_da_cents: 300000, forbice_a_cents: 500000 });
    const r = await env.DB.prepare("SELECT forbice_da_cents, forbice_a_cents FROM proposals WHERE id = 'p1'").first();
    expect(r).toEqual({ forbice_da_cents: 300000, forbice_a_cents: 500000 });
  });
});
