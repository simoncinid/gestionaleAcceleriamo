import { DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { api } from "../../../api";
import { ACCETTA, caricaFile, fileNonAmmesso, peso } from "../../../carica";
import { Campo, Pulsante, Tag, classiPulsante, cx } from "../../../ds";
import { momento } from "../../../format";
import { dataTesto } from "../../../../worker/processo/processo";
import { useRefreshLeads } from "../../../hooks";
import type { DocumentRow, VersioneDocumento } from "../../../types";

type InCorso = { chiave: string; nome: string; avanzamento: number };

// Documenti del lead (spec 29/10/2026): file caricati (PDF, Excel, Word, audio, immagini) con versioni, e link.
// Un'azione primaria: "Carica file" (o trascina). Togliere chiede un secondo tocco sullo stesso pulsante.
// "nuovi": documenti con novità di altri che la persona non aveva ancora visto (segnati "Nuovo").
export function Documents({ leadId, documents, ora, nuovi = [] }: { leadId: string; documents: DocumentRow[]; ora: number; nuovi?: string[] }) {
  const refresh = useRefreshLeads();
  const [chiede, setChiede] = useState<string | null>(null);
  const [coda, setCoda] = useState<InCorso[]>([]);
  const [sopra, setSopra] = useState(false);
  const [conLink, setConLink] = useState(false);
  const scegli = useRef<HTMLInputElement>(null);
  const scegliVersione = useRef<HTMLInputElement>(null);
  const [perVersione, setPerVersione] = useState<DocumentRow | null>(null);

  // Uno dopo l'altro: ogni file ha la sua riga con l'avanzamento, a fine giro la scheda si aggiorna.
  async function invia(files: File[], doc?: DocumentRow) {
    const buoni = files.filter((f) => {
      const no = fileNonAmmesso(f);
      if (no) toast.error(no);
      return !no;
    });
    if (!buoni.length) return;
    const righe = buoni.map((f) => ({ chiave: crypto.randomUUID(), nome: doc ? `Nuova versione di ${doc.name}` : f.name, avanzamento: 0 }));
    setCoda((c) => [...c, ...righe]);
    let fatti = 0;
    for (const [i, f] of buoni.entries()) {
      const { chiave } = righe[i];
      const path = doc ? `/documents/${doc.id}/versioni?nome=${encodeURIComponent(f.name)}` : `/leads/${leadId}/documents?nome=${encodeURIComponent(f.name)}`;
      try {
        const r = (await caricaFile(path, f, (p) => setCoda((c) => c.map((x) => (x.chiave === chiave ? { ...x, avanzamento: p } : x))))) as { document?: { kind?: string; callId?: string | null } };
        fatti++;
        // Le regole automatiche possono spostarlo fuori dal foglio: si dice dove è finito.
        if (!doc && r.document?.kind === "preventivo") toast.info(`${f.name}: è nel blocco Preventivo, in cima alla scheda`);
        else if (!doc && r.document?.callId) toast.info(`${f.name}: è accanto alla sua call, in Collegamenti`);
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`);
      } finally {
        setCoda((c) => c.filter((r) => r.chiave !== chiave));
      }
    }
    if (fatti) {
      toast.success(doc ? "Nuova versione caricata" : fatti === 1 ? "File caricato" : `${fatti} file caricati`);
      refresh();
    }
  }

  const remove = useMutation({
    mutationFn: (id: string) => api(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => { setChiede(null); toast.success("Documento tolto"); refresh(); },
    onError: (e) => toast.error(e.message),
  });

  const lascia = (e: DragEvent) => {
    e.preventDefault();
    setSopra(false);
    void invia([...e.dataTransfer.files]);
  };

  return (
    <div className="flex flex-col gap-5">
      <div
        data-zona-file
        onDragOver={(e) => { e.preventDefault(); setSopra(true); }}
        onDragLeave={() => setSopra(false)}
        onDrop={lascia}
        className={cx("flex flex-col items-start gap-3 rounded-[10px] border-[1.5px] border-dashed p-4 transition-colors duration-150",
          sopra ? "border-accento bg-crema" : "border-[#CFC6B9]")}
      >
        <Pulsante variante="primario" icona={<UploadSimple size={20} weight="bold" aria-hidden />} onClick={() => scegli.current?.click()}>
          Carica file
        </Pulsante>
        <p className="text-nota text-grigio">O trascina qui i file. PDF, TXT, Excel, Word, audio e immagini, fino a 100 MB.</p>
        <input ref={scegli} type="file" multiple accept={ACCETTA} className="hidden" data-testid="scegli-file"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void invia(f); }} />
        <input ref={scegliVersione} type="file" accept={ACCETTA} className="hidden" data-testid="scegli-versione"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (perVersione) void invia(f.slice(0, 1), perVersione); setPerVersione(null); }} />
      </div>

      {coda.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Caricamenti in corso">
          {coda.map((r) => (
            <li key={r.chiave} className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-3 text-testo">
                <span className="min-w-0 truncate">{r.nome}</span>
                <span className="shrink-0 text-nota text-grigio tabular-nums">{r.avanzamento >= 1 ? "Salvataggio" : `${Math.round(r.avanzamento * 100)}%`}</span>
              </span>
              <span role="progressbar" aria-label={`Caricamento di ${r.nome}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.avanzamento * 100)}
                className="block h-1.5 overflow-hidden rounded-full bg-sabbia">
                <span className="block h-full rounded-full bg-accento motion-safe:transition-[width] motion-safe:duration-200" style={{ width: `${Math.max(4, r.avanzamento * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {documents.length === 0 && coda.length === 0 ? <p className="text-nota text-grigio">Nessun documento.</p> : (
        <ul className="flex flex-col divide-y divide-sabbia">
          {documents.map((d) => (
            <RigaDocumento key={d.id} d={d} ora={ora} nuovo={nuovi.includes(d.id)} chiede={chiede === d.id}
              togliendo={remove.isPending && remove.variables === d.id}
              onTogli={() => (chiede === d.id ? remove.mutate(d.id) : setChiede(d.id))}
              onVersione={() => { setPerVersione(d); scegliVersione.current?.click(); }} />
          ))}
        </ul>
      )}

      {conLink ? <AggiungiLink leadId={leadId} onFatto={() => { setConLink(false); refresh(); }} /> : (
        <button type="button" className="self-start text-nota font-semibold text-ink underline decoration-[#CFC6B9] underline-offset-4 hover:decoration-ink min-h-11"
          onClick={() => setConLink(true)}>
          Aggiungi un link (Drive, Docs)
        </button>
      )}
    </div>
  );
}

function RigaDocumento({ d, ora, nuovo, chiede, togliendo, onTogli, onVersione }: {
  d: DocumentRow; ora: number; nuovo: boolean; chiede: boolean; togliendo: boolean; onTogli: () => void; onVersione: () => void;
}) {
  const [storico, setStorico] = useState(false);
  const file = `/api/documents/${d.id}/file`;
  const meta = [
    d.file && (d.version ?? 1) > 1 ? `Versione ${d.version}` : null,
    d.file ? peso(d.size) : "Link",
    d.authorName,
    momento(d.updatedAt ?? d.createdAt, ora),
  ].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-col gap-2 py-3" data-documento={d.id}>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            {d.file || d.url
              ? <a href={d.file ? file : (d.url ?? undefined)} target="_blank" rel="noopener noreferrer" className="truncate text-testo font-semibold text-accento-testo underline-offset-4 hover:underline">{d.name}</a>
              : <span className="truncate text-testo">{d.name}</span>}
            {nuovo && <Tag>Nuovo</Tag>}
          </span>
          <span className="text-nota text-grigio tabular-nums">{meta}</span>
        </div>
        <Pulsante variante={chiede ? "distruttivo" : "fantasma"} className="shrink-0" inCorso={togliendo} onClick={onTogli}>
          {chiede ? "Tocca di nuovo" : "Togli"}
        </Pulsante>
      </div>
      {d.file && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <a href={`${file}?scarica=1`} download className={cx(classiPulsante("fantasma", "md"), "px-3")}>
            <DownloadSimple size={18} weight="bold" aria-hidden />Scarica
          </a>
          <Pulsante variante="fantasma" className="px-3" onClick={onVersione}>Nuova versione</Pulsante>
          {(d.version ?? 1) > 1 && (
            <Pulsante variante="fantasma" className="px-3" aria-expanded={storico} onClick={() => setStorico((s) => !s)}>
              {storico ? "Chiudi storico" : "Versioni precedenti"}
            </Pulsante>
          )}
        </div>
      )}
      {storico && <Storico id={d.id} ora={ora} />}
    </li>
  );
}

export function Storico({ id, ora }: { id: string; ora: number }) {
  const q = useQuery({ queryKey: ["documento", id, "versioni"], queryFn: () => api<{ versioni: VersioneDocumento[] }>(`/documents/${id}/versioni`).then((r) => r.versioni) });
  if (q.isLoading) return <p className="pl-1 text-nota text-grigio">Carico lo storico…</p>;
  if (q.error) return <p className="pl-1 text-nota text-errore">{q.error.message}</p>;
  const [, ...vecchie] = q.data ?? [];
  return (
    <ol className="flex flex-col" aria-label="Versioni precedenti">
      {vecchie.map((v) => (
        <li key={v.id} className="flex flex-col py-1">
          <a href={`/api/documents/${id}/file?versione=${v.version}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center self-start text-testo font-semibold text-ink underline decoration-[#CFC6B9] underline-offset-4 hover:decoration-ink">
            {[`Versione ${v.version}`, dataTesto(v.createdAt).replace(/^\S+ /, ""), v.authorName].filter(Boolean).join(", ")}
          </a>
          <span className="text-nota text-grigio tabular-nums">{[v.fileName, peso(v.size), momento(v.createdAt, ora)].filter(Boolean).join(" · ")}</span>
        </li>
      ))}
    </ol>
  );
}

function AggiungiLink({ leadId, onFatto }: { leadId: string; onFatto: () => void }) {
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const add = useMutation({
    mutationFn: () => api(`/leads/${leadId}/documents`, { method: "POST", json: { name: nome.trim(), url: url.trim() } }),
    onSuccess: () => { toast.success("Link aggiunto"); onFatto(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="flex flex-col gap-3 border-t border-sabbia pt-4">
      <Campo etichetta="Nome del documento" placeholder="Preventivo" value={nome} onChange={(e) => setNome(e.target.value)} />
      <Campo etichetta="Link" type="url" inputMode="url" placeholder="https://drive.google.com/..." value={url} onChange={(e) => setUrl(e.target.value)} />
      <Pulsante variante="secondario" className="self-start" inCorso={add.isPending} motivoSpento={nome.trim() && url.trim() ? undefined : "Servono nome e link"} onClick={() => add.mutate()}>
        Aggiungi link
      </Pulsante>
    </div>
  );
}
