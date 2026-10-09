const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// RFC 5545, testo: barra rovesciata, punto e virgola, virgola e a capo vanno protetti.
const protetto = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// RFC 5545: righe al massimo 75 byte, le successive iniziano con uno spazio.
function piega(riga: string): string {
  const out: string[] = [];
  let resto = riga;
  let limite = 75;
  while (new TextEncoder().encode(resto).length > limite) {
    let n = limite;
    while (new TextEncoder().encode(resto.slice(0, n)).length > limite) n--;
    out.push(resto.slice(0, n));
    resto = resto.slice(n);
    limite = 74;
  }
  out.push(resto);
  return out.join("\r\n ");
}

// ora = DTSTAMP: chi chiama passa un valore stabile (la creazione della call), così i tentativi ripetuti producono lo stesso file.
export function creaIcs(e: { uid: string; inizio: number; minuti?: number; titolo: string; descrizione?: string; luogo?: string | null; ora?: number; organizer?: string; attendee?: string | null }): string {
  const righe = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Acceleriamo//Acceleriamo OS//IT", "CALSCALE:GREGORIAN", "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${e.uid}@acceleriamo.it`,
    `DTSTAMP:${utc(e.ora ?? Date.now())}`,
    `DTSTART:${utc(e.inizio)}`,
    `DTEND:${utc(e.inizio + (e.minuti ?? 30) * 60_000)}`,
    ...(e.organizer ? [`ORGANIZER:mailto:${e.organizer}`] : []),
    ...(e.attendee ? [`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${e.attendee}`] : []),
    `SUMMARY:${protetto(e.titolo)}`,
    ...(e.descrizione ? [`DESCRIPTION:${protetto(e.descrizione)}`] : []),
    ...(e.luogo ? [`LOCATION:${protetto(e.luogo)}`] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return righe.map(piega).join("\r\n") + "\r\n";
}
