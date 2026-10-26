import { describe, expect, it } from "vitest";
import { linkHttp } from "../worker/leads/validation";

// Riunione del 26/10: "link non valido" incollando il link del Meet senza https.
describe("linkHttp", () => {
  const s = linkHttp("Link Meet non valido");
  it("aggiunge https a un link incollato senza", () => {
    expect(s.parse("meet.google.com/abc-defg-hij")).toBe("https://meet.google.com/abc-defg-hij");
    expect(s.parse("  www.example.com/x ")).toBe("https://www.example.com/x");
  });
  it("lascia com'è un link con http o https", () => {
    expect(s.parse("https://meet.google.com/abc")).toBe("https://meet.google.com/abc");
    expect(s.parse("http://example.com")).toBe("http://example.com");
  });
  it("rifiuta testo che non è un link e gli schemi diversi da http", () => {
    expect(s.safeParse("domani alle 5").success).toBe(false);
    expect(s.safeParse("javascript:alert(1)").success).toBe(false);
    expect(s.safeParse("ftp://example.com").success).toBe(false);
  });
});
