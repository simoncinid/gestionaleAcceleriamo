import { describe, expect, it } from "vitest";
import { dayBounds, fmtDuration, fromInput, toInput } from "../src/format";

describe("formato", () => {
  it("datetime-local avanti e indietro", () => {
    const ms = fromInput("2026-10-12T15:30");
    expect(ms).not.toBeNull();
    expect(toInput(ms)).toBe("2026-10-12T15:30");
    expect(fromInput("")).toBeNull();
    expect(toInput(null)).toBe("");
  });
  it("limiti della giornata", () => {
    const b = dayBounds(new Date(2026, 9, 12, 15, 30));
    expect(new Date(b.from).getHours()).toBe(0);
    expect(b.until - b.from).toBe(86_400_000 - 1);
  });
  it("durate leggibili", () => {
    expect(fmtDuration(null)).toBe("n.d.");
    expect(fmtDuration(45 * 60_000)).toBe("45 min");
    expect(fmtDuration(135 * 60_000)).toBe("2 h 15 min");
    expect(fmtDuration(50 * 3_600_000)).toBe("2 giorni 2 h");
    expect(fmtDuration(26 * 3_600_000)).toBe("1 giorno 2 h");
  });
});
