import { describe, expect, it } from "vitest";
import { scegliAdesso } from "../worker/today/adesso";
import type { CallOggi, RigaOggi } from "../worker/today/tipi";

const ORA = 1_800_000_000_000;
const riga = (id: string, nextActionAt: number | null, createdAt = ORA - 1000): RigaOggi => ({
  id, company: id, contactName: null, phone: null, email: null, stageId: "da-richiamare", stageLabel: "Da richiamare", nextAction: "Richiamare",
  nextActionAt, stageChangedAt: ORA, ownerId: null, score: null, attemptCount: 0, createdAt, setupCents: null, feeCents: null, slaScadenza: null,
});
const call = (id: string, scheduledAt: number): CallOggi => ({ id, leadId: id, company: id, contactName: null, phone: null, kind: "conoscenza", scheduledAt, meetLink: null });

describe("voce Adesso (DS 6.5)", () => {
  it("prima la scaduta più vecchia", () => {
    const v = scegliAdesso({ nuovi: [riga("nuovo", ORA - 99_000)], daFare: [riga("tardi", ORA - 1000), riga("vecchia", ORA - 50_000), riga("dopo", ORA + 1000)], call: [call("c", ORA + 60_000)] }, ORA);
    expect(v).toMatchObject({ tipo: "lead", id: "vecchia" });
  });
  it("poi la prossima in scadenza", () => {
    expect(scegliAdesso({ nuovi: [], daFare: [riga("b", ORA + 9000), riga("a", ORA + 2000)], call: [] }, ORA)).toMatchObject({ id: "a" });
  });
  it("poi la call entro 30 minuti", () => {
    expect(scegliAdesso({ nuovi: [riga("n", null)], daFare: [], call: [call("tardi", ORA + 40 * 60_000), call("presto", ORA + 20 * 60_000)] }, ORA)).toMatchObject({ tipo: "call", id: "presto" });
  });
  it("poi il primo nuovo mai toccato, il più vecchio", () => {
    expect(scegliAdesso({ nuovi: [riga("recente", null, ORA - 10), riga("vecchio", null, ORA - 5000)], daFare: [], call: [] }, ORA)).toMatchObject({ id: "vecchio" });
  });
  it("niente: null", () => {
    expect(scegliAdesso({ nuovi: [], daFare: [], call: [] }, ORA)).toBeNull();
  });
});
