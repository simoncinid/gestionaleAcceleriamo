import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone } from "../worker/lib/normalize";

describe("normalizzazione", () => {
  it("telefoni italiani scritti in modi diversi diventano uguali", () => {
    for (const v of ["+39 333 1234567", "0039 3331234567", "333-123-4567", "(333) 123 45 67", "393331234567"]) {
      expect(normalizePhone(v)).toBe("3331234567");
    }
  });
  it("fissi e numeri corti", () => {
    expect(normalizePhone("050 123456")).toBe("050123456");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
  it("email in minuscolo e senza spazi", () => {
    expect(normalizeEmail("  Mario.Rossi@Azienda.IT ")).toBe("mario.rossi@azienda.it");
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});
