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
  it("organizzatore e invitato, con il testo ancora protetto", () => {
    const ics = creaIcs({ uid: "x", inizio: 0, titolo: "a; b, c", organizer: "tommaso@mail.acceleriamo.it", attendee: "luca@esempio.it", ora: 0 });
    // La riga ATTENDEE supera i 75 byte e viene piegata: si controlla il testo spiegato.
    const spiegato = ics.replace(/\r\n /g, "");
    expect(ics).toMatch(/\r\nATTENDEE;[^\r]*\r\n /);
    expect(spiegato).toContain("ORGANIZER:mailto:tommaso@mail.acceleriamo.it\r\n");
    expect(spiegato).toContain("ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:luca@esempio.it\r\n");
    expect(spiegato).toContain("SUMMARY:a\\; b\\, c\r\n");
    expect(ics.split("\r\n").every((r) => new TextEncoder().encode(r).length <= 75)).toBe(true);
  });
  it("senza invitato niente riga ATTENDEE", () => {
    expect(creaIcs({ uid: "x", inizio: 0, titolo: "t", attendee: null, ora: 0 })).not.toContain("ATTENDEE");
  });
  it("stesso DTSTAMP, stesso file", () => {
    const e = { uid: "x", inizio: 1000, titolo: "t", ora: 500 };
    expect(creaIcs(e)).toBe(creaIcs(e));
  });
});
