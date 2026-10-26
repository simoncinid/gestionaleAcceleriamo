// Lettura minima di un invito di calendario (.ics di Google Calendar): solo i campi che servono alla call.
// Formato: RFC 5545. Righe ripiegate (continuano con uno spazio), proprietà NOME;PARAMETRI:VALORE.

export type Partecipante = { email: string; nome: string | null };
export type Invito = {
  metodo: string; // REQUEST, CANCEL, PUBLISH...
  uid: string;
  versione: number; // SEQUENCE
  inizio: number; // ms
  durataMin: number | null;
  titolo: string;
  link: string | null;
  organizzatore: Partecipante | null;
  partecipanti: Partecipante[];
};

const MEET = /https?:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;
export const linkMeet = (testo: string | null | undefined): string | null => MEET.exec(testo ?? "")?.[0] ?? null;

type Prop = { nome: string; parametri: Record<string, string>; valore: string };

function righe(ics: string): string[] {
  // Via tutti i ritorni a capo "\r": alcuni programmi di posta li raddoppiano.
  return ics.replace(/\r/g, "").replace(/\n[ \t]/g, "").split("\n").filter(Boolean);
}

function leggiProp(riga: string): Prop | null {
  // I due punti dentro un parametro tra virgolette (CN="Rossi: officina") non chiudono il nome.
  let virgolette = false;
  let i = 0;
  for (; i < riga.length; i++) {
    if (riga[i] === '"') virgolette = !virgolette;
    else if (riga[i] === ":" && !virgolette) break;
  }
  if (i >= riga.length) return null;
  const [nome, ...par] = riga.slice(0, i).split(";");
  const parametri: Record<string, string> = {};
  for (const p of par) {
    const k = p.indexOf("=");
    if (k > 0) parametri[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, "");
  }
  return { nome: nome.toUpperCase(), parametri, valore: riga.slice(i + 1) };
}

const testoIcs = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

// Ora locale di un fuso qualsiasi in millisecondi UTC: si parte dall'ora come se fosse UTC e si toglie lo scarto del fuso.
function daFuso(anno: number, mese: number, giorno: number, ore: number, minuti: number, secondi: number, fuso: string): number {
  const comeUtc = Date.UTC(anno, mese - 1, giorno, ore, minuti, secondi);
  let formato: Intl.DateTimeFormat;
  try {
    formato = new Intl.DateTimeFormat("en-GB", { timeZone: fuso, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    formato = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  const scarto = (ms: number) => {
    const p = Object.fromEntries(formato.formatToParts(ms).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
  };
  // Due passi: il secondo sistema i casi vicini al cambio dell'ora legale.
  const primo = comeUtc - scarto(comeUtc);
  return comeUtc - scarto(primo);
}

function leggiData(p: Prop): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(p.valore.trim());
  if (!m || !m[4]) return null; // eventi di un giorno intero: niente ora, niente call
  const [a, me, g, o, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number);
  if (m[7] === "Z") return Date.UTC(a, me - 1, g, o, mi, s);
  return daFuso(a, me, g, o, mi, s, p.parametri.TZID ?? "Europe/Rome");
}

function leggiDurata(v: string): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(v.trim());
  if (!m) return null;
  const min = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return min || null;
}

const partecipante = (p: Prop): Partecipante | null => {
  const email = p.valore.replace(/^mailto:/i, "").trim().toLowerCase();
  if (!email.includes("@")) return null;
  return { email, nome: p.parametri.CN ? testoIcs(p.parametri.CN) : null };
};

export function leggiInvito(ics: string): Invito | null {
  let metodo = "REQUEST";
  let dentro = false;
  let fatto = false;
  const ev: Prop[] = [];
  for (const r of righe(ics)) {
    const p = leggiProp(r);
    if (!p) continue;
    if (p.nome === "METHOD" && !dentro) metodo = p.valore.trim().toUpperCase();
    else if (p.nome === "BEGIN" && p.valore.toUpperCase() === "VEVENT" && !fatto) dentro = true;
    else if (p.nome === "END" && p.valore.toUpperCase() === "VEVENT" && dentro) { dentro = false; fatto = true; }
    else if (dentro) ev.push(p);
  }
  const una = (nome: string) => ev.find((p) => p.nome === nome);
  const uid = una("UID")?.valore.trim();
  const inizioP = una("DTSTART");
  const inizio = inizioP ? leggiData(inizioP) : null;
  if (!uid || inizio == null) return null;
  const fineP = una("DTEND");
  const fine = fineP ? leggiData(fineP) : null;
  const durataP = una("DURATION");
  const durataMin = fine != null && fine > inizio ? Math.round((fine - inizio) / 60_000) : durataP ? leggiDurata(durataP.valore) : null;
  const organizzatoreP = una("ORGANIZER");
  const testi = ev.filter((p) => ["X-GOOGLE-CONFERENCE", "LOCATION", "DESCRIPTION", "URL"].includes(p.nome)).map((p) => testoIcs(p.valore)).join("\n");
  return {
    metodo,
    uid,
    versione: Number(una("SEQUENCE")?.valore ?? 0) || 0,
    inizio,
    durataMin,
    titolo: testoIcs(una("SUMMARY")?.valore ?? ""),
    link: linkMeet(testi),
    organizzatore: organizzatoreP ? partecipante(organizzatoreP) : null,
    partecipanti: ev.filter((p) => p.nome === "ATTENDEE").map(partecipante).filter((x): x is Partecipante => x !== null),
  };
}
