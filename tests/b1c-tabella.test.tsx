import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Lead } from "../src/pagine/commerciale/Lead";
import { FILTRI_BASE, conteggi, filtra, ordina, titoloLead } from "../src/pagine/commerciale/tabellaLead";
import { REDIRECT_1A, SOTTOMENU } from "../src/guscio/aree";
import { FASI, GIORNO, ORA, ORE, riga } from "./b1c-fixture";
import { authed, call } from "./helpers";
import { render } from "./render";

const LEADS = [
  riga("futuro", { scadenza: ORA + GIORNO, stato: "futuro" }),
  riga("vecchio", { scadenza: ORA - 3 * GIORNO, stato: "scaduto" }),
  riga("oggi", { scadenza: ORA + 2 * ORE, stato: "oggi", stageId: "appuntamento-confermato" }),
  riga("ieri", { scadenza: ORA - 2 * GIORNO, stato: "scaduto", stageId: "in-attesa-decisione" }),
  riga("cliente", { stageId: "chiuso" }),
  riga("perso", { stageId: "non-chiuso" }),
];
const pagina = (percorso = "/commerciale/lead") =>
  render(<Lead ora={ORA} />, { percorso, dati: [[["leads", "tabella"], LEADS], [["stages"], FASI], [["users"], [{ id: "tommaso", name: "Tommaso" }]]] });

describe("modifica 18: tabella dei lead", () => {
  it("ordine di default: scadenza crescente, prima i più scaduti; i chiusi restano fuori da Aperti", () => {
    const ordinati = ordina(filtra(LEADS, FILTRI_BASE), FILTRI_BASE, FASI).map((l) => l.id);
    expect(ordinati).toEqual(["vecchio", "ieri", "oggi", "futuro"]);
  });

  it("titolo con i numeri dei segmenti Aperti e Scaduti", () => {
    const n = conteggi(LEADS, FILTRI_BASE);
    expect(n).toEqual({ aperti: 4, scaduti: 2 });
    expect(titoloLead(n)).toBe("4 lead aperti, 2 scaduti");
    expect(filtra(LEADS, { ...FILTRI_BASE, seg: "scaduti" })).toHaveLength(n.scaduti);
    expect(titoloLead({ aperti: 1, scaduti: 1 })).toBe("1 lead aperto, 1 scaduto");
  });

  it("pagina: titolo, otto colonne, righe da 44 px, niente totali in euro né avatar", () => {
    const html = pagina();
    expect(html).toContain("4 lead aperti, 2 scaduti");
    for (const t of ["Azienda", "Fase", "Da fare", "Scadenza", "Responsabile", "Fonte", "Ultimo contatto"]) expect(html).toContain(`>${t}<`);
    expect(html).toMatch(/<td class="h-11 /);
    expect(html).not.toContain("€");
    expect(html).not.toContain("Officina cliente");
    // La riga "Da fare" viene dalla funzione unica, la scadenza scaduta da più di un giorno è rossa.
    expect(html).toContain("Richiamare: tentativo 2 di 5");
    expect(html).toContain("text-[#B42318]");
    expect(html).toContain("2 giorni fa");
  });

  it("menu e indirizzi: la voce Scaletta diventa Lead, i vecchi indirizzi portano alla tabella", () => {
    expect(SOTTOMENU.commerciale.find((v) => v.etichetta === "Lead")?.percorso).toBe("/commerciale/lead");
    expect(SOTTOMENU.commerciale.some((v) => v.etichetta === "Scaletta")).toBe(false);
    expect(REDIRECT_1A.find((r) => r.da === "/scaletta")?.a).toBe("/commerciale/lead");
  });

  it("GET /api/leads dà l'ultimo contatto: chiamate ed esiti contano, le note no", async () => {
    const cookie = await authed();
    const ora = Date.now();
    await env.DB.prepare("INSERT INTO leads (id, company, source, stage_id, stage_changed_at, created_at, updated_at) VALUES ('L1', 'Officina', 'manuale', 'da-richiamare', ?1, ?1, ?1), ('L2', 'Forno', 'manuale', 'da-richiamare', ?1, ?1, ?1)").bind(ora).run();
    await env.DB.prepare("INSERT INTO activities (id, lead_id, type, body, created_at) VALUES ('a1', 'L1', 'contatto', '', ?1), ('a2', 'L1', 'nota', '', ?2), ('a3', 'L2', 'nota', '', ?2)").bind(ora - 5000, ora - 10).run();
    const r = (await (await call("/api/leads", {}, cookie)).json()) as { leads: { id: string; ultimoContatto: number | null }[] };
    expect(r.leads.find((l) => l.id === "L1")?.ultimoContatto).toBe(ora - 5000);
    expect(r.leads.find((l) => l.id === "L2")?.ultimoContatto).toBeNull();
  });
});
