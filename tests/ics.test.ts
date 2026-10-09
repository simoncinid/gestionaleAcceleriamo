import { describe, expect, it } from "vitest";
import { creaIcs } from "../worker/calls/ics";

describe("file .ics", () => {
  it("evento valido con orari in UTC, righe CRLF e testo protetto", () => {
    const ics = creaIcs({ uid: "call-1", inizio: Date.UTC(2026, 9, 13, 8, 0), minuti: 30, titolo: "Call con Acceleriamo; conoscenza, prima parte", luogo: "https://meet.google.com/abc-defg-hij", ora: Date.UTC(2026, 9, 10, 7, 0) });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261013T080000Z\r\n");
    expect(ics).toContain("DTEND:20261013T083000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261010T070000Z\r\n");
    expect(ics).toContain("UID:call-1@acceleriamo.it\r\n");
    // RFC 5545: punto e virgola e virgola protetti con la barra rovesciata.
    expect(ics).toContain("SUMMARY:Call con Acceleriamo\\; conoscenza\\, prima parte\r\n");
    expect(ics).toContain("LOCATION:https://meet.google.com/abc-defg-hij\r\n");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.split("\r\n").every((r) => new TextEncoder().encode(r).length <= 75)).toBe(true);
  });
  it("protegge barra rovesciata e a capo", () => {
    const ics = creaIcs({ uid: "x", inizio: 0, titolo: "t", descrizione: "a\\b\nc\r\nd", ora: 0 });
    expect(ics).toContain("DESCRIPTION:a\\\\b\\nc\\nd\r\n");
  });
  it("piega le righe lunghe", () => {
    const ics = creaIcs({ uid: "x", inizio: 0, titolo: "a".repeat(200), ora: 0 });
    expect(ics).toMatch(/\r\n a/);
  });
});
