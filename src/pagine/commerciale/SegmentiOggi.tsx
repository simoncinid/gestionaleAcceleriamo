import { useNavigate } from "react-router";
import { Chip } from "../../ds";

const VOCI = [["oggi", "Oggi", "/commerciale/oggi"], ["lunedi", "Lunedì", "/commerciale/oggi/lunedi"], ["diario", "Diario", "/commerciale/oggi/diario"]] as const;

// Spec 6.4: tre segmenti fissi dentro Oggi (chip ammesse, sono 3).
export function SegmentiOggi({ attivo }: { attivo: "oggi" | "lunedi" | "diario" }) {
  const vai = useNavigate();
  return (
    <div className="flex gap-2" role="group" aria-label="Sezione di Oggi">
      {VOCI.map(([k, t, href]) => <Chip key={k} selezionato={k === attivo} onClick={() => vai(href)}>{t}</Chip>)}
    </div>
  );
}
