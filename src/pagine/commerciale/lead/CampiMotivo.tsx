import { useQuery } from "@tanstack/react-query";
import { api } from "../../../api";
import { AreaTesto, CampoGiorno, Selettore } from "../../../ds";
import { MOTIVI_CON_DATA, MOTIVI_CON_TESTO, MOTIVI_PERSI, type CodiceMotivo } from "../../../../worker/processo/motivi";

const GIORNO = 86_400_000;
// Scorciatoie del ricontatto: fra uno, tre, sei mesi (alle 9 del mattino del giorno, ora di Roma via CampoGiorno).
const fraMesi = (ora: number) => [
  { etichetta: "Fra un mese", ms: ora + 30 * GIORNO },
  { etichetta: "Fra tre mesi", ms: ora + 91 * GIORNO },
  { etichetta: "Fra sei mesi", ms: ora + 182 * GIORNO },
];

export type Motivo = { lostReason: string | null; lostNote: string; recontactAt: number | null };

// Motivo per andare in 80 (contratto blocco 1, sezione 7): codici fissi, nomi da Impostazioni.
// "Non è il momento" chiede il giorno in cui risentirlo, "Altro" chiede due parole. Niente altro.
export function CampiMotivo({ valore, onCambia, apertoAllInizio }: { valore: Motivo; onCambia: (m: Motivo) => void; apertoAllInizio?: boolean }) {
  const impostazioni = useQuery({ queryKey: ["settings"], queryFn: () => api<{ motivi: { id: string; etichetta: string }[] }>("/settings") });
  const opzioni = MOTIVI_PERSI.map((m) => ({ valore: m.id as string, etichetta: impostazioni.data?.motivi.find((x) => x.id === m.id)?.etichetta ?? m.etichetta }));
  const codice = valore.lostReason as CodiceMotivo | null;
  return (
    <div className="flex flex-col gap-3">
      <Selettore etichetta="Motivo" apertoAllInizio={apertoAllInizio} opzioni={opzioni} valore={valore.lostReason}
        onCambia={(m) => onCambia({ lostReason: m, lostNote: "", recontactAt: null })} />
      {codice && MOTIVI_CON_DATA.includes(codice) && (
        <CampoGiorno etichetta="Quando risentirlo" scorciatoie={fraMesi} valore={valore.recontactAt} onCambia={(ms) => onCambia({ ...valore, recontactAt: ms })} />
      )}
      {codice && MOTIVI_CON_TESTO.includes(codice) && (
        <AreaTesto etichetta="Il motivo, in due parole" rows={2} value={valore.lostNote} onChange={(e) => onCambia({ ...valore, lostNote: e.target.value })} />
      )}
    </div>
  );
}
