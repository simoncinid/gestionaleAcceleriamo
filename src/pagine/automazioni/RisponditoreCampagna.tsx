import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { CampagnaRisponditore } from "../../../worker/risponditore/routes";
import { api } from "../../api";
import { AreaTesto, Campo, Foglio, Interruttore, Pulsante, Selettore } from "../../ds";

export type RisorsaBreve = { slug: string; titolo: string; attiva: boolean };

type DovePost = "tutti" | "uno";
const DOVE: { valore: DovePost; etichetta: string }[] = [
  { valore: "tutti", etichetta: "Tutti i post" },
  { valore: "uno", etichetta: "Un post preciso" },
];

// Foglio della campagna: nuova o da modificare. Un'unica azione piena, il salvataggio.
// Le risposte pubbliche si scrivono una per riga: il risponditore ne sceglie una a caso, così non sembrano tutte uguali.
export function FoglioCampagna({ campagna, risorse, onChiudi }: { campagna: CampagnaRisponditore | null; risorse: RisorsaBreve[]; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(campagna?.nome ?? "");
  const [parola, setParola] = useState(campagna?.parola ?? "");
  const [dove, setDove] = useState<DovePost>(campagna?.mediaId ? "uno" : "tutti");
  const [mediaId, setMediaId] = useState(campagna?.mediaId ?? "");
  const [risposte, setRisposte] = useState((campagna?.rispostePubbliche ?? []).join("\n"));
  const [privato, setPrivato] = useState(campagna?.testoPrivato ?? "");
  const [pulsante, setPulsante] = useState(campagna?.etichettaPulsante ?? "Mandami il link");
  const [risorsa, setRisorsa] = useState<string | null>(campagna?.risorsaSlug ?? null);
  const [testoLink, setTestoLink] = useState(campagna?.testoLink ?? "");
  const [attiva, setAttiva] = useState(campagna?.attiva ?? true);
  const elencoRisposte = risposte.split("\n").map((r) => r.trim()).filter(Boolean);
  const salva = useMutation({
    mutationFn: () => api(campagna ? `/risponditore/campagne/${campagna.id}` : "/risponditore/campagne", {
      method: campagna ? "PUT" : "POST",
      json: {
        nome: nome.trim(), parola, mediaId: dove === "uno" ? mediaId.trim() : null, rispostePubbliche: elencoRisposte,
        testoPrivato: privato.trim(), etichettaPulsante: pulsante.trim(), risorsaSlug: risorsa, testoLink: testoLink.trim(), attiva,
      },
    }),
    onSuccess: () => { toast.success("Campagna salvata"); void qc.invalidateQueries({ queryKey: ["risponditore"] }); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  const manca = !nome.trim() ? "Scrivi il nome"
    : !parola.trim() ? "Scrivi la parola"
    : dove === "uno" && !mediaId.trim() ? "Scrivi l'id del post"
    : elencoRisposte.length === 0 ? "Scrivi almeno una risposta pubblica"
    : !privato.trim() ? "Scrivi il messaggio privato"
    : !risorsa ? "Scegli la risorsa"
    : !testoLink.trim() ? "Scrivi il testo del link"
    : undefined;
  // Le risorse spente non si offrono, tranne quella già collegata a questa campagna.
  const opzioniRisorse = risorse.filter((r) => r.attiva || r.slug === campagna?.risorsaSlug)
    .map((r) => ({ valore: r.slug, etichetta: r.attiva ? r.titolo : `${r.titolo} (spenta)`, meta: `/r/${r.slug}` }));
  return (
    <Foglio aperto lato titolo={campagna ? "Modifica la campagna" : "Nuova campagna"} onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={manca} onClick={() => salva.mutate()}>Salva la campagna</Pulsante>}>
      <Campo etichetta="Nome" aiuto="Lo vedi solo tu, per esempio: Guida ai preventivi" value={nome} onChange={(e) => setNome(e.target.value)} />
      <Campo etichetta="Parola nel commento" aiuto="Maiuscole e accenti non contano" value={parola} onChange={(e) => setParola(e.target.value)} />
      <Selettore<DovePost> etichetta="Su quali post" opzioni={DOVE} valore={dove} onCambia={setDove} />
      {dove === "uno" && <Campo etichetta="Id del post" aiuto="Il numero del post su Instagram" inputMode="numeric" value={mediaId} onChange={(e) => setMediaId(e.target.value)} />}
      <AreaTesto etichetta="Risposte pubbliche, una per riga" cresce value={risposte} onChange={(e) => setRisposte(e.target.value)} />
      <p className="-mt-2 text-nota text-grigio">Sotto il commento ne parte una a caso.</p>
      <AreaTesto etichetta="Messaggio privato" cresce value={privato} onChange={(e) => setPrivato(e.target.value)} />
      <Campo etichetta="Testo del pulsante" aiuto="Al massimo 20 caratteri" maxLength={20} value={pulsante} onChange={(e) => setPulsante(e.target.value)} />
      <Selettore etichetta="Risorsa da mandare" opzioni={opzioniRisorse} valore={risorsa} onCambia={setRisorsa} segnaposto={opzioniRisorse.length ? "Scegli" : "Nessuna risorsa"} />
      <AreaTesto etichetta="Testo che accompagna il link" cresce value={testoLink} onChange={(e) => setTestoLink(e.target.value)} />
      <Interruttore etichetta="Campagna attiva" aiuto="Spenta, i commenti con questa parola restano senza risposta" acceso={attiva} onCambia={setAttiva} />
    </Foglio>
  );
}
