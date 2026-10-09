import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { AreaTesto, Campo, Errore, Foglio, Intestazione, Pulsante, Riga, Selettore, Skeleton, StatoVuoto, type Opzione } from "../../ds";
import { useModelli, useStages } from "../../hooks";
import type { MessageTemplate, Stage } from "../../types";
import { Aggiungi } from "./parti";

type Canale = "whatsapp" | "email";
const CANALI: Opzione<Canale>[] = [{ valore: "whatsapp", etichetta: "WhatsApp" }, { valore: "email", etichetta: "Email" }];
type BozzaModello = { id: string | null; key: string | null; channel: Canale; title: string; subject: string; body: string; stageId: string };
const NUOVO: BozzaModello = { id: null, key: null, channel: "whatsapp", title: "", subject: "", body: "", stageId: "nessuna" };

const bozzaModello = (m: MessageTemplate): BozzaModello => ({ id: m.id, key: m.key, channel: m.channel, title: m.title, subject: m.subject ?? "", body: m.body, stageId: m.stageId ?? "nessuna" });
const corpoModello = (b: BozzaModello) => ({
  channel: b.channel, title: b.title.trim(), subject: b.channel === "email" ? b.subject.trim() || null : null, body: b.body.trim(), stageId: b.stageId === "nessuna" ? null : b.stageId,
});

function FoglioModello({ iniziale, fasi, onChiudi }: { iniziale: BozzaModello; fasi: Stage[]; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [b, setB] = useState(iniziale);
  const [secondoTocco, setSecondoTocco] = useState(false);
  const fatto = (testo: string) => { toast.success(testo); qc.invalidateQueries({ queryKey: ["templates"] }); onChiudi(); };
  const salva = useMutation({
    mutationFn: () => (b.id ? api(`/templates/${b.id}`, { method: "PATCH", json: corpoModello(b) }) : api("/templates", { method: "POST", json: corpoModello(b) })),
    onSuccess: () => fatto("Modello salvato"),
    onError: (e) => toast.error(e.message),
  });
  const cancella = useMutation({
    mutationFn: () => api(`/templates/${b.id}`, { method: "DELETE" }),
    onSuccess: () => fatto("Modello cancellato"),
    onError: (e) => toast.error(e.message),
  });
  const manca = !b.title.trim() ? "Serve un titolo" : !b.body.trim() ? "Scrivi il testo" : undefined;
  return (
    <Foglio aperto titolo={b.id ? b.title || "Modello" : "Nuovo modello"} onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={manca} onClick={() => salva.mutate()}>Salva il modello</Pulsante>}>
      <Campo etichetta="Titolo" value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} />
      <Selettore etichetta="Canale" opzioni={CANALI} valore={b.channel} onCambia={(v) => setB({ ...b, channel: v })} />
      {b.channel === "email" && <Campo etichetta="Oggetto" value={b.subject} onChange={(e) => setB({ ...b, subject: e.target.value })} />}
      <AreaTesto etichetta="Testo" rows={6} value={b.body} onChange={(e) => setB({ ...b, body: e.target.value })} />
      <p className="text-meta text-grigio">Segnaposto: {"{referente}, {azienda}, {link_meet}, {ora}, {data}"}</p>
      <Selettore etichetta="Fase" opzioni={[{ valore: "nessuna", etichetta: "Nessuna fase" }, ...fasi.map((f) => ({ valore: f.id, etichetta: f.label }))]} valore={b.stageId} onCambia={(v) => setB({ ...b, stageId: v })} />
      {b.id && !b.key && (
        <Pulsante variante="distruttivo" inCorso={cancella.isPending} onClick={() => (secondoTocco ? cancella.mutate() : setSecondoTocco(true))}>
          {secondoTocco ? "Tocca di nuovo per cancellare" : "Cancella il modello"}
        </Pulsante>
      )}
    </Foglio>
  );
}

// Spec 11.3: nessun "+" in Impostazioni; il modello nuovo nasce dal link "Aggiungi" in fondo alla lista.
export function Modelli() {
  const m = useModelli();
  const fasi = useStages();
  const [aperto, setAperto] = useState<BozzaModello | null>(null);
  if (m.isLoading || fasi.isLoading) return <div className="mx-auto max-w-[720px] p-4"><Skeleton righe={8} /></div>;
  if (m.error) return <div className="mx-auto max-w-[720px] p-4"><Errore errore={m.error} onRiprova={() => void m.refetch()} /></div>;
  const nomeFase = (id: string | null) => fasi.data?.find((f) => f.id === id)?.label;
  return (
    <div className="mx-auto grid max-w-[720px] gap-4 p-4">
      <Intestazione eyebrow="Impostazioni" titolo="Modelli" numero={m.data?.length || undefined} coda={m.data?.length === 1 ? "modello" : "modelli"} />
      {m.data?.length === 0 && <StatoVuoto titolo="Nessun modello" testo="Aggiungine uno qui sotto." />}
      <ul className="grid gap-2">
        {m.data?.map((t) => (
          <li key={t.id}>
            <Riga titolo={t.title} secondaria={t.channel === "email" ? "Email" : "WhatsApp"} meta={nomeFase(t.stageId) ? `Fase: ${nomeFase(t.stageId)}` : undefined} onClick={() => setAperto(bozzaModello(t))} />
          </li>
        ))}
      </ul>
      <Aggiungi onClick={() => setAperto(NUOVO)}>Aggiungi un modello</Aggiungi>
      {aperto && <FoglioModello iniziale={aperto} fasi={fasi.data ?? []} onChiudi={() => setAperto(null)} />}
    </div>
  );
}
