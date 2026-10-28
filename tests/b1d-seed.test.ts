import { describe, expect, it } from "vitest";
import { datiDemo } from "../scripts/demo-dati";
import { MOTIVI_PERSI } from "../worker/processo/motivi";
import { FASI_APERTE, prossimaAzione, type LeadPerProcesso } from "../worker/processo/processo";
import { normalizePhone } from "../worker/lib/normalize";

// Blocco 1, modifiche 5 e 25: quattordici lead demo coerenti con la funzione unica (contratto, sezioni 2, 6 e 10).
const ORA = Date.UTC(2026, 9, 15, 9); // giovedì 15 ottobre, 11:00 a Roma
const d = datiDemo(ORA, "hash");
const lead = (id: string) => {
  const l = d.leads.find((x) => x.id === id);
  if (!l) throw new Error(`manca ${id}`);
  return l;
};
const perProcesso = (id: string): LeadPerProcesso => {
  const l = lead(id);
  return {
    stageId: l.stageId, company: l.company, contactName: l.contactName ?? null, createdAt: l.createdAt, stageChangedAt: l.stageChangedAt,
    nextAction: l.nextAction ?? null, nextActionAt: l.nextActionAt ?? null, attemptCount: l.attemptCount ?? 0, pausedUntil: l.pausedUntil ?? null, noShow: l.noShow ?? 0,
  };
};

describe("seed demo del blocco 1", () => {
  it("quattordici lead: uno per ognuna delle dodici fasi, uno senza telefono, un doppione", () => {
    expect(d.leads).toHaveLength(14);
    const FASI: Record<string, string> = {
      10: "da-chiamare-prima-volta", 20: "da-richiamare", 30: "appuntamento-confermato", 35: "in-attesa-preventivo", 40: "presentazione-confermata",
      45: "analisi-fissata", 50: "in-attesa-progetto", 55: "progetto-fissato", 60: "in-attesa-decisione", 70: "chiuso", 80: "non-chiuso", 90: "fake",
    };
    for (const [f, stageId] of Object.entries(FASI)) expect(lead(`demo-lead-${f}`).stageId).toBe(stageId);
    expect(d.leads.map((l) => l.stageId).filter((s) => s === "da-chiamare-prima-volta")).toHaveLength(3);
    expect(d.leads.some((l) => /collaudo/i.test(l.company))).toBe(false);
  });

  it("senza telefono: aperto in 10, niente telefono", () => {
    const l = lead("demo-lead-senza-telefono");
    expect(l.stageId).toBe("da-chiamare-prima-volta");
    expect(l.phone ?? null).toBeNull();
    expect(l.phoneNorm ?? null).toBeNull();
  });

  it("doppione: stesso telefono di un lead aperto, con duplicateOfId", () => {
    const dop = lead("demo-lead-doppione");
    const orig = lead(dop.duplicateOfId!);
    expect(FASI_APERTE).toContain(orig.stageId);
    expect(dop.phoneNorm).toBe(orig.phoneNorm);
    // La chiave è quella del gestionale (normalizePhone), così i doppioni veri la trovano.
    for (const l of d.leads) expect(l.phoneNorm ?? null).toBe(normalizePhone(l.phone));
  });

  it("ogni lead aperto ha azione e scadenza dalla funzione unica, con scaduti, oggi e futuri", () => {
    const stati = d.leads.filter((l) => FASI_APERTE.includes(l.stageId)).map((l) => {
      const p = prossimaAzione(perProcesso(l.id!), ORA);
      expect(p.azione).toBeTruthy();
      expect(p.scadenza).not.toBeNull();
      return p.stato;
    });
    expect(stati).toContain("scaduto");
    expect(stati).toContain("oggi");
    expect(stati).toContain("futuro");
  });

  it("30: conoscenza futura con link Meet; 35: conoscenza fatta", () => {
    const c30 = d.calls.find((c) => c.leadId === "demo-lead-30")!;
    expect(c30.kind).toBe("conoscenza");
    expect(c30.scheduledAt).toBeGreaterThan(ORA);
    expect(c30.meetLink).toMatch(/^https:\/\/meet\.esempio\.invalid\//);
    expect(c30.outcome ?? null).toBeNull();
    expect(lead("demo-lead-30").nextActionAt).toBe(c30.scheduledAt);
    expect(d.calls.find((c) => c.leadId === "demo-lead-35" && c.kind === "conoscenza")?.outcome).toBe("fatta");
  });

  it("35: proposta dell'offerta con la forbice, nessuna call dell'offerta", () => {
    const p35 = d.proposals.find((p) => p.leadId === "demo-lead-35")!;
    expect(p35.forbiceDaCents).toBeGreaterThan(0);
    expect(p35.forbiceACents).toBeGreaterThanOrEqual(p35.forbiceDaCents!);
    expect(d.calls.some((c) => c.leadId === "demo-lead-35" && c.kind === "offerta")).toBe(false);
  });

  it("40, 45, 55: la call della fase è futura e del tipo giusto; 50: analisi fatta", () => {
    for (const [id, kind] of [["demo-lead-40", "offerta"], ["demo-lead-45", "analisi"], ["demo-lead-55", "progetto"]] as const) {
      const k = d.calls.find((c) => c.leadId === id && c.kind === kind)!;
      expect(k.scheduledAt, id).toBeGreaterThan(ORA);
      expect(k.outcome ?? null, id).toBeNull();
      expect(lead(id).nextActionAt, id).toBe(k.scheduledAt);
    }
    expect(d.proposals.some((p) => p.leadId === "demo-lead-40")).toBe(true);
    expect(d.calls.find((c) => c.leadId === "demo-lead-50" && c.kind === "analisi")?.outcome).toBe("fatta");
  });

  it("le call dicono solo i quattro tipi nuovi", () => {
    expect(new Set(d.calls.map((c) => c.kind))).toEqual(new Set(["conoscenza", "offerta", "analisi", "progetto"]));
  });

  it("60: proposta presentata alla call del progetto", () => {
    expect(d.calls.find((c) => c.leadId === "demo-lead-60" && c.kind === "progetto")?.outcome).toBe("fatta");
    const p60 = d.proposals.find((p) => p.leadId === "demo-lead-60")!;
    expect(p60.status).toBe("presentata");
    expect(p60.presentedAt).toBeLessThan(ORA);
  });

  it("70: cliente con un'automazione attiva e un canone", () => {
    const cliente = d.clients.find((c) => c.originLeadId === "demo-lead-70")!;
    expect(cliente).toBeTruthy();
    expect(d.automations.filter((a) => a.clientId === cliente.id && a.status === "attiva")).toHaveLength(1);
    expect(d.fees.filter((f) => f.clientId === cliente.id)).toHaveLength(1);
  });

  it("80 con un motivo a codice; 90 non profilato; 20 con un tentativo e storico", () => {
    expect(MOTIVI_PERSI.map((m) => m.id as string)).toContain(lead("demo-lead-80").lostReason);
    expect(lead("demo-lead-90").stageId).toBe("fake");
    expect(lead("demo-lead-20").attemptCount).toBe(1);
    expect(d.activities.filter((a) => a.leadId === "demo-lead-20").length).toBeGreaterThanOrEqual(2);
  });

  it("utenti: demo è Diego, più Tommaso; assegnazione scritta nelle impostazioni", () => {
    expect(d.users.find((u) => u.id === "demo")?.name).toMatch(/Diego/);
    const tommaso = d.users.find((u) => /Tommaso/.test(u.name));
    expect(tommaso).toBeTruthy();
    const imp = d.settings.find((s) => s.key === "assegnazione")!;
    const val = JSON.parse(imp.value);
    expect(val.primaChiamata).toBe("demo");
    expect(val.presentazione).toBe(tommaso!.id);
    // Responsabile di default per fase (modifica 25): Diego in 10 e 20, Tommaso da 30 a 70.
    expect(lead("demo-lead-20").ownerId).toBe("demo");
    for (const f of ["30", "35", "40", "45", "50", "55", "60", "70"]) expect(lead(`demo-lead-${f}`).ownerId).toBe(tommaso!.id);
  });
});
