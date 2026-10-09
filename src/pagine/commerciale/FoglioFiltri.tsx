import { useState } from "react";
import { Foglio, Pulsante, Selettore, campo } from "../../ds";
import { useUsers } from "../../hooks";
import { FILTRI_VUOTI, type Filtri } from "./filtriScaletta";

const FONTI = [["", "Tutte"], ["meta", "Meta"], ["foglio_andrea", "Foglio Andrea"], ["manuale", "A mano"], ["sito", "Sito"], ["passaparola", "Passaparola"], ["altro", "Altro"]] as const;
const PUNTEGGI = [["", "Tutti"], ["verde", "Verde"], ["giallo", "Giallo"], ["grigio", "Grigio"]] as const;
const PERIODI = [["tutti", "Sempre"], ["0", "Oggi"], ["7", "Ultimi 7 giorni"], ["30", "Ultimi 30 giorni"], ["90", "Ultimi 90 giorni"], ["altro", "Altro periodo"]] as const;
const GIORNO = 86_400_000;

const mezzanotte = (giorniFa: number, ora = Date.now()) => {
  const d = new Date(ora - giorniFa * GIORNO);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const aGiorno = (ms: number | null) => (ms == null ? "" : new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
const daGiorno = (v: string, fine = false) => {
  if (!v) return null;
  const d = new Date(`${v}T00:00`);
  return fine ? d.getTime() + GIORNO - 1 : d.getTime();
};

// Spec 6.5: un selettore a espansione per ciascun filtro. Il foglio è una schermata sovrapposta, con il suo primario.
export function FoglioFiltri({ filtri, campagne, onApplica, onChiudi }: { filtri: Filtri; campagne: string[]; onApplica: (f: Filtri) => void; onChiudi: () => void }) {
  const utenti = useUsers();
  const [f, setF] = useState(filtri);
  const [periodo, setPeriodo] = useState<string>(filtri.da == null && filtri.a == null ? "tutti" : "altro");
  // "" vale "tutti": è la prima opzione di ogni filtro. Il selettore non accetta "" come valore, quindi passa per "tutti".
  const scelta = (k: "ownerId" | "source" | "campaign" | "score", etichetta: string, opzioni: readonly (readonly [string, string])[]) => (
    <Selettore etichetta={etichetta} valore={f[k] || "tutti"}
      opzioni={opzioni.map(([v, t]) => ({ valore: v || "tutti", etichetta: t }))}
      onCambia={(v) => setF((p) => ({ ...p, [k]: v === "tutti" ? "" : v }))} />
  );
  const cambiaPeriodo = (v: string) => {
    setPeriodo(v);
    if (v === "tutti") setF((p) => ({ ...p, da: null, a: null }));
    else if (v !== "altro") setF((p) => ({ ...p, da: mezzanotte(Number(v)), a: null }));
  };
  return (
    <Foglio aperto titolo="Filtri" onChiudi={onChiudi}
      principale={<div className="grid gap-2">
        <Pulsante variante="primario" misura="lg" className="w-full" onClick={() => { onApplica(f); onChiudi(); }}>Mostra i lead</Pulsante>
        <Pulsante variante="fantasma" className="w-full" onClick={() => { setF({ ...FILTRI_VUOTI, q: f.q }); setPeriodo("tutti"); }}>Togli i filtri</Pulsante>
      </div>}>
      <div className="grid gap-3">
        {scelta("ownerId", "Responsabile", [["", "Tutti"], ...(utenti.data ?? []).map((u) => [u.id, u.name] as const)])}
        {scelta("source", "Fonte", FONTI)}
        {scelta("campaign", "Campagna", [["", "Tutte"], ...campagne.map((c) => [c, c] as const)])}
        {scelta("score", "Punteggio", PUNTEGGI)}
        <Selettore etichetta="Arrivati" valore={periodo} onCambia={cambiaPeriodo} opzioni={PERIODI.map(([v, t]) => ({ valore: v, etichetta: t }))} />
        {periodo === "altro" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-secondaria font-medium">Dal
              <input type="date" className={campo} value={aGiorno(f.da)} onChange={(e) => setF((p) => ({ ...p, da: daGiorno(e.target.value) }))} />
            </label>
            <label className="grid gap-1 text-secondaria font-medium">Fino al
              <input type="date" className={campo} value={aGiorno(f.a)} onChange={(e) => setF((p) => ({ ...p, a: daGiorno(e.target.value, true) }))} />
            </label>
          </div>
        )}
      </div>
    </Foglio>
  );
}
