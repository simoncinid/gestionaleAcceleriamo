import { SOURCE_LABELS } from "../../../format";
import type { Activity, Collegamenti, DocumentRow } from "../../../types";
import { AZIONE_CALL } from "../../../../worker/regole/fasi-call";
import { STATI as STATI_PROPOSTA } from "../Proposte";

// Storico del lead a tappe (giro 4, 30/10/2026): una riga per passo, in ordine di data, con i suoi documenti accanto.
// Le tappe vengono dai dati che ci sono già: arrivo, call, proposte, preventivi caricati, cambi di fase, cliente.
// Le call fissate nel futuro vanno in fondo, in grigio, solo come data: l'azione resta nel Da fare. Note e attività minute restano in "Tutte le attività".

export type DocTappa = { id: string; testo: string; href: string; scarica?: boolean; nuovo: boolean };
export type Tappa = {
  chiave: string; quando: number; testo: string; dettaglio?: string;
  link?: { to: string; testo: string }; documenti: DocTappa[];
  caricaRegistrazione?: string; // id della call fatta senza registrazione
  futura: boolean; attuale: boolean;
};

const ESITO = { fatta: "fatta", saltata: "saltata, non si è presentato", rimandata: "rimandata" } as const;
const file = (id: string) => `/api/documents/${id}/file`;

export function tappe({ lead, attivita, dati, documentiCall, preventivi, nuovi, ora }: {
  lead: { createdAt: number; source: string; metaCampaign?: string | null };
  attivita: Pick<Activity, "id" | "type" | "body" | "createdAt">[];
  dati: Pick<Collegamenti, "call" | "proposte" | "cliente"> | undefined;
  documentiCall: Map<string, DocumentRow[]>; preventivi: DocumentRow[]; nuovi: string[]; ora: number;
}): Tappa[] {
  const t: Tappa[] = [];
  const base = { documenti: [] as DocTappa[], futura: false, attuale: false };
  const fonte = SOURCE_LABELS[lead.source] ?? lead.source;
  t.push({ ...base, chiave: "arrivo", quando: lead.createdAt, testo: lead.source === "manuale" ? "Lead inserito a mano" : `Lead arrivato da ${fonte}`,
    dettaglio: lead.metaCampaign ? `Campagna ${lead.metaCampaign}` : undefined });

  for (const k of dati?.call ?? []) {
    const futura = k.outcome == null && k.scheduledAt > ora;
    const nome = AZIONE_CALL[k.kind];
    const testo = k.outcome ? `${nome} ${ESITO[k.outcome]}` : futura ? `${nome} fissata` : `${nome}, esito da segnare`;
    const docs = documentiCall.get(k.id) ?? [];
    const reg = docs.filter((d) => d.kind === "registrazione");
    const tra = docs.filter((d) => d.kind === "trascrizione");
    t.push({
      ...base, chiave: `call-${k.id}`, quando: k.scheduledAt, testo, futura, link: futura ? undefined : { to: `/commerciale/call/${k.id}`, testo: "Apri la call" },
      documenti: [
        ...tra.map((d, i) => ({ id: d.id, testo: tra.length > 1 ? `Guarda la trascrizione ${i + 1}` : "Guarda la trascrizione", href: file(d.id), nuovo: nuovi.includes(d.id) })),
        ...reg.map((d, i) => ({ id: d.id, testo: reg.length > 1 ? `Ascolta la registrazione ${i + 1}` : "Ascolta la registrazione", href: file(d.id), nuovo: nuovi.includes(d.id) })),
      ],
      caricaRegistrazione: k.outcome === "fatta" && reg.length === 0 ? k.id : undefined,
    });
  }

  // Il file del preventivo va sulla riga della proposta più recente; senza proposta ha una riga sua.
  const proposte = [...(dati?.proposte ?? [])].sort((a, b) => a.data - b.data);
  const ultimaProposta = proposte.at(-1);
  const docPreventivo = (d: DocumentRow): DocTappa => ({ id: d.id, testo: "Apri il preventivo", href: file(d.id), nuovo: nuovi.includes(d.id) });
  for (const p of proposte) {
    const stato = (STATI_PROPOSTA[p.status as keyof typeof STATI_PROPOSTA] ?? p.status).toLowerCase();
    t.push({
      ...base, chiave: `proposta-${p.id}`, quando: p.data,
      testo: p.status === "bozza" ? `Proposta ${p.number} in bozza` : p.status === "registrata" ? `Preventivo ${p.number} registrato` : `Preventivo ${p.number} inviato`,
      dettaglio: ["registrata", "presentata", "bozza"].includes(p.status) ? undefined : `Adesso: ${stato}`,
      link: { to: `/commerciale/proposte/${p.id}`, testo: "Apri la proposta" },
      documenti: p === ultimaProposta ? preventivi.slice(0, 1).map(docPreventivo) : [],
    });
  }
  if (!ultimaProposta) {
    for (const d of preventivi) {
      t.push({ ...base, chiave: `preventivo-${d.id}`, quando: d.createdAt, testo: "Preventivo caricato", dettaglio: (d.version ?? 1) > 1 ? `Versione ${d.version}` : undefined, documenti: [docPreventivo(d)] });
    }
  }

  for (const a of attivita) {
    if (a.type !== "cambio_fase") continue;
    const verso = /a "([^"]+)"\s*$/.exec(a.body ?? "")?.[1];
    if (verso) t.push({ ...base, chiave: `fase-${a.id}`, quando: a.createdAt, testo: `Passato a ${verso}` });
  }

  if (dati?.cliente) {
    t.push({ ...base, chiave: "cliente", quando: dati.cliente.dal, testo: `Diventato cliente: ${dati.cliente.name}`, link: { to: `/commerciale/clienti/${dati.cliente.id}`, testo: "Apri la scheda cliente" } });
  }

  const passate = t.filter((x) => !x.futura).sort((a, b) => a.quando - b.quando);
  const future = t.filter((x) => x.futura).sort((a, b) => a.quando - b.quando);
  if (passate.length) passate[passate.length - 1].attuale = true;
  return [...passate, ...future];
}
