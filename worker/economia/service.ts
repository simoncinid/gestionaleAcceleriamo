import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { clients, fees, invoices, type Fee, type Invoice } from "../db/schema";
import { daRoma, meseRoma, partiRoma } from "../lib/roma";
import { statoFattura, type StatoFattura } from "./calcoli";

export type FatturaRiga = Omit<Invoice, "deletedAt" | "feeId"> & { cliente: string; stato: StatoFattura };
export type CanoneRiga = Fee & { cliente: string };
export type CostoRiga = { id: string; date: number; month: string; category: "strumenti" | "costi_vivi" | "altro"; amountCents: number; clientId: string | null; cliente: string | null; automationId: string | null; automazione: string | null; note: string | null };
export type MeseCosti = { mese: string; totaleCents: number; costi: CostoRiga[] };
export type Cruscotto = {
  ricorrenteCents: number;
  obiettivoCents: number;
  inRitardo: FatturaRiga[];
  setupMeseCents: number;
  setupAnnoCents: number;
  daIncassareCents: number;
  costiMeseCents: number;
};

// Spec 9: i clienti fuori perimetro non compaiono mai in Economia.
const nelPerimetro = and(eq(clients.scope, "acceleriamo"), isNull(clients.deletedAt));
const somma = (xs: { amountCents: number }[]) => xs.reduce((t, x) => t + x.amountCents, 0);

export async function elencoFatture(db: Db, now: number, clientId?: string): Promise<FatturaRiga[]> {
  const righe = await db
    .select({
      id: invoices.id, clientId: invoices.clientId, cliente: clients.name, kind: invoices.kind, number: invoices.number, amountCents: invoices.amountCents,
      period: invoices.period, issuedAt: invoices.issuedAt, dueAt: invoices.dueAt, paidAt: invoices.paidAt, pdfUrl: invoices.pdfUrl, note: invoices.note,
    })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(isNull(invoices.deletedAt), clientId ? eq(invoices.clientId, clientId) : nelPerimetro))
    .orderBy(asc(invoices.dueAt));
  return righe.map((f) => ({ ...f, stato: statoFattura(f, now) }));
}

export async function elencoCanoni(db: Db): Promise<CanoneRiga[]> {
  const righe = await db.select({ f: fees, cliente: clients.name }).from(fees).innerJoin(clients, eq(clients.id, fees.clientId)).where(nelPerimetro).orderBy(asc(clients.name));
  return righe.map((r) => ({ ...r.f, cliente: r.cliente }));
}

export const mesePrima = (mese: string, n: number) => {
  const [a, m] = mese.split("-").map(Number);
  const t = a * 12 + (m - 1) - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

// Ultimi dodici mesi, il corrente per primo. Un costo legato a un cliente fuori perimetro (o a una sua automazione) resta fuori.
export async function costiPerMese(d1: D1Database, now: number): Promise<MeseCosti[]> {
  const corrente = meseRoma(now);
  const { results } = await d1.prepare(`
    SELECT k.id, k.date, k.month, k.category, k.amount_cents AS amountCents, k.client_id AS clientId, c.name AS cliente,
           k.automation_id AS automationId, a.name AS automazione, k.note
    FROM costs k
    LEFT JOIN clients c ON c.id = k.client_id
    LEFT JOIN automations a ON a.id = k.automation_id
    LEFT JOIN clients ca ON ca.id = a.client_id
    WHERE k.deleted_at IS NULL AND k.month >= ?1
      AND coalesce(c.scope, 'acceleriamo') = 'acceleriamo' AND coalesce(ca.scope, 'acceleriamo') = 'acceleriamo'
    ORDER BY k.date DESC`).bind(mesePrima(corrente, 11)).all<CostoRiga>();
  const mesi = new Map<string, CostoRiga[]>([[corrente, []]]);
  for (const k of results) mesi.set(k.month, [...(mesi.get(k.month) ?? []), k]);
  return [...mesi.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([mese, costi]) => ({ mese, totaleCents: somma(costi), costi }));
}

export async function cruscotto(db: Db, d1: D1Database, now: number, obiettivoCents: number): Promise<Cruscotto> {
  const [fatture, canoni, mesi] = await Promise.all([elencoFatture(db, now), elencoCanoni(db), costiPerMese(d1, now)]);
  const p = partiRoma(now);
  const inizioMese = daRoma(p.anno, p.mese, 1);
  const inizioAnno = daRoma(p.anno, 1, 1);
  // Spec 9.1: il ricorrente conta solo i canoni; i setup (acconto e saldo) stanno sempre a parte.
  const setup = fatture.filter((f) => (f.kind === "acconto" || f.kind === "saldo") && f.paidAt != null);
  return {
    ricorrenteCents: somma(canoni.filter((c) => c.status === "attivo")),
    obiettivoCents,
    inRitardo: fatture.filter((f) => f.stato === "in_ritardo").sort((a, b) => a.dueAt! - b.dueAt!),
    setupMeseCents: somma(setup.filter((f) => f.paidAt! >= inizioMese)),
    setupAnnoCents: somma(setup.filter((f) => f.paidAt! >= inizioAnno)),
    daIncassareCents: somma(fatture.filter((f) => f.stato === "emessa" || f.stato === "in_ritardo")),
    costiMeseCents: mesi[0].totaleCents,
  };
}
