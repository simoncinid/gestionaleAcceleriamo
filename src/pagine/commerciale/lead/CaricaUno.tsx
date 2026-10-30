import { useRef, useState } from "react";
import { toast } from "sonner";
import { ACCETTA, caricaFile, fileNonAmmesso } from "../../../carica";
import { useRefreshLeads } from "../../../hooks";

// Un file solo, con il posto già deciso (registrazione di una call, preventivo, nuova versione):
// il pulsante chiama "avvia" con la rotta, l'input nascosto sceglie il file. Uno alla volta.
export function useCaricaUno() {
  const refresh = useRefreshLeads();
  const input = useRef<HTMLInputElement>(null);
  const meta = useRef<{ path: (nome: string) => string; fatto: string } | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);

  async function invia(f: File) {
    const m = meta.current;
    if (!m) return;
    const no = fileNonAmmesso(f);
    if (no) return void toast.error(no);
    setInCorso(m.fatto);
    try {
      await caricaFile(m.path(f.name), f, () => undefined);
      toast.success(m.fatto);
      refresh();
    } catch (e) {
      toast.error(`${f.name}: ${(e as Error).message}`);
    } finally {
      setInCorso(null);
    }
  }

  const campo = (
    <input ref={input} type="file" accept={ACCETTA} className="hidden" data-testid="carica-uno"
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void invia(f); }} />
  );
  return {
    campo,
    inCorso,
    avvia: (path: (nome: string) => string, fatto: string) => { meta.current = { path, fatto }; input.current?.click(); },
  };
}
