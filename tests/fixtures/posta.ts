// Mail finte per le prove del lettore della casella (nessuna mail vera).
// L'invito riproduce la forma di quelli di Google Calendar: fuso Europe/Rome, righe ripiegate, link Meet.
export const ICS_GOOGLE = (o: { uid?: string; seq?: number; inizio?: string; fine?: string; metodo?: string; partecipanti?: string[]; titolo?: string } = {}) => [
  "BEGIN:VCALENDAR",
  "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "VERSION:2.0",
  `METHOD:${o.metodo ?? "REQUEST"}`,
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Rome",
  "BEGIN:DAYLIGHT",
  "DTSTART:19700329T020000",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
  "BEGIN:VEVENT",
  `DTSTART;TZID=Europe/Rome:${o.inizio ?? "20261105T100000"}`,
  `DTEND;TZID=Europe/Rome:${o.fine ?? "20261105T104500"}`,
  "DTSTAMP:20261026T150000Z",
  "ORGANIZER;CN=Tommaso Rovini:mailto:tommaso@acceleriamo.it",
  `UID:${o.uid ?? "abc123finto@google.com"}`,
  ...(o.partecipanti ?? ["ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=Mario Rossi;X-NUM-GUESTS=0:mailto:mario@officina-rossi-finta.it"]),
  "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=tommaso@acceleriamo.it;X-NUM-GUESTS=0:mailto:tommaso@acceleriamo.it",
  "X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij",
  `SUMMARY:${o.titolo ?? "Acceleriamo x Officina Rossi Finta"}`,
  "DESCRIPTION:Partecipa con Google Meet: https://meet.google.com/abc-defg-hij\\n\\nAltre opzioni di parte",
  " cipazione: https://tel.meet/abc-defg-hij",
  `SEQUENCE:${o.seq ?? 0}`,
  "STATUS:CONFIRMED",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

export const MODULO_SITO = `Nuova richiesta di valutazione gratuita da acceleriamo.it

Nome e cognome: Giulia Neri
Azienda: Carpenteria Neri Finta
Email: giulia@carpenteria-neri-finta.it
Telefono: 347 123 4567
Il tuo ruolo: Titolare
Cosa ti fa perdere più tempo?: Fare i preventivi
Raccontacelo in due righe: Ogni preventivo ci prende mezza giornata
Quante persone se ne occupano?: 1–2
Quanto spesso lo fai?: Ogni giorno
Che programmi usi?: Excel, Danea
`;

// Stessa richiesta impaginata a tabella (etichetta su una riga, valore sotto), senza email.
export const MODULO_TABELLA = `Nome e cognome
Paolo Bruni
Azienda
Autotrasporti Bruni Finti
Telefono
+39 333 987 6543
Cosa ti fa perdere più tempo?
Organizzare giri e appuntamenti
`;

export const RISPOSTA_LEAD = `Buongiorno Tommaso,
va bene giovedì, vi aspetto.

Mario

Il giorno lun 26 ott 2026 alle 10:12 Tommaso Rovini <tommaso@acceleriamo.it> ha scritto:
> Buongiorno Mario, le propongo giovedì alle 10.
> Grazie
`;
