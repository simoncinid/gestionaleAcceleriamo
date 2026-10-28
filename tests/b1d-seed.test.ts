import { describe, expect, it } from "vitest";
import { datiDemo } from "../scripts/demo-dati";
import { MOTIVI_PERSI } from "../worker/processo/motivi";
import { FASI_APERTE, prossimaAzione, type LeadPerProcesso } from "../worker/processo/processo";
import { normalizePhone } from "../worker/lib/normalize";

// Blocco 1, modifica 5: undici lead demo coerenti con la funzione unica (contratto, sezioni 2, 6 e 10).
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
  it("undici lead: uno per fase, uno senza telefono, un doppione", () => {
    expect(d.leads).toHaveLength(11);
    for (const f of ["10", "20", "30", "40", "50", "60", "70", "80", "90"]) expect(lead(`demo-lead-${f}`)).toBeTruthy();
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

  it("30: consulenza futura con link Meet; 40: consulenza fatta", () => {
    const c30 = d.calls.find((c) => c.leadId === "demo-lead-30")!;
    expect(c30.kind).toBe("conoscenza");
    expect(c30.scheduledAt).toBeGreaterThan(ORA);
    expect(c30.meetLink).toMatch(/^https:\/\/meet\.esempio\.invalid\//);
    expect(c30.outcome ?? null).toBeNull();
    expect(lead("demo-lead-30").nextActionAt).toBe(c30.scheduledAt);
    expect(d.calls.find((c) => c.leadId === "demo-lead-40" && c.kind === "conoscenza")?.outcome).toBe("fatta");
  });

  it("50: proposta e presentazione futura; 60: proposta presentata", () => {
    expect(d.proposals.some((p) => p.leadId === "demo-lead-50")).toBe(true);
    const pres = d.calls.find((c) => c.leadId === "demo-lead-50" && c.kind === "presentazione")!;
    expect(pres.scheduledAt).toBeGreaterThan(ORA);
    expect(pres.outcome ?? null).toBeNull();
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
    // Responsabile di default per fase: Diego da 10 a 30, Tommaso da 40 a 70.
    expect(lead("demo-lead-30").ownerId).toBe("demo");
    expect(lead("demo-lead-40").ownerId).toBe(tommaso!.id);
  });
});
