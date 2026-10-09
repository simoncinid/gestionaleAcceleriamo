import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Pulsante, Riga } from "../../ds";
import { quando } from "../../format";
import {
  ambienteCorrente, attivaPush, disiscriviBrowser, etichettaDispositivo, iscrittoQui, leggiIdPush, PERMESSO_NEGATO, salvaIdPush, statoPush, type Ambiente,
} from "../../push";

type Dispositivo = { id: string; etichetta: string; createdAt: number; lastOkAt: number | null; rotta: boolean };

const PASSI_IPHONE = [
  "Apri Acceleriamo OS in Safari.",
  "Tocca il pulsante Condividi, il quadrato con la freccia in su.",
  "Scegli \"Aggiungi alla schermata Home\", poi apri l'app dalla Home e torna qui.",
];

const MESSAGGIO_PERMESSO = "Le notifiche non si sono attivate. Controlla il permesso del browser.";

// Il toast dice cosa è successo davvero: il server (ApiError), il service worker che non risponde, o il permesso.
export function messaggioErroreAttiva(e: unknown): string {
  if (!(e instanceof Error) || e.message === PERMESSO_NEGATO) return MESSAGGIO_PERMESSO;
  return e.message || MESSAGGIO_PERMESSO;
}

// Rimuovere il dispositivo in uso annulla anche l'iscrizione nel browser e dimentica l'id: il pulsante "Attiva" torna.
export async function rimuoviDispositivo(
  id: string,
  dip: { cancella: (id: string) => Promise<unknown>; disiscrivi: () => Promise<void>; idSalvato: () => string | null; salva: (id: string | null) => void },
): Promise<{ eraQuesto: boolean }> {
  await dip.cancella(id);
  const eraQuesto = dip.idSalvato() === id;
  if (eraQuesto) {
    dip.salva(null);
    await dip.disiscrivi().catch(() => undefined);
  }
  return { eraQuesto };
}

// Spec 8.3: il permesso del browser si chiede solo dopo il tocco sul pulsante (secondario, mai primario).
export function AttivaNotifiche({ ambiente }: { ambiente?: Ambiente }) {
  const qc = useQueryClient();
  const [amb] = useState(() => ambiente ?? ambienteCorrente());
  const [idSalvato, setIdSalvato] = useState(leggiIdPush);
  const chiave = useQuery({ queryKey: ["push-chiave"], queryFn: () => api<{ chiave: string | null }>("/push-subscriptions/chiave") });
  const disp = useQuery({ queryKey: ["push-dispositivi"], queryFn: () => api<{ dispositivi: Dispositivo[] }>("/push-subscriptions") });
  // "Attivo" solo se l'id salvato da questo browser è ancora tra i miei dispositivi e non è rotto.
  const stato = statoPush(amb, iscrittoQui(idSalvato, disp.data?.dispositivi));
  // Senza chiave pubblica VAPID le notifiche non sono collegate: il pulsante resta spento, senza errori.
  const scollegato = chiave.data !== undefined && !chiave.data.chiave;

  const attiva = useMutation({
    mutationFn: async () => {
      // Un id salvato che non vale più (rimosso dal server dopo un 410, o rotto): l'endpoint del browser è morto, se ne chiede uno nuovo.
      if (idSalvato) await disiscriviBrowser().catch(() => undefined);
      const sub = await attivaPush(chiave.data!.chiave!);
      return api<{ id: string }>("/push-subscriptions", { method: "POST", json: { ...sub, etichetta: etichettaDispositivo(amb.ua, amb.tocco) } });
    },
    onSuccess: ({ id }) => {
      salvaIdPush(id);
      setIdSalvato(id);
      toast.success("Notifiche attive su questo dispositivo");
      qc.invalidateQueries({ queryKey: ["push-dispositivi"] });
    },
    onError: (e) => toast.error(messaggioErroreAttiva(e)),
  });
  const rimuovi = useMutation({
    mutationFn: (id: string) => rimuoviDispositivo(id, {
      cancella: (x) => api(`/push-subscriptions/${x}`, { method: "DELETE" }),
      disiscrivi: disiscriviBrowser,
      idSalvato: leggiIdPush,
      salva: salvaIdPush,
    }),
    onSuccess: ({ eraQuesto }) => {
      if (eraQuesto) setIdSalvato(null);
      qc.invalidateQueries({ queryKey: ["push-dispositivi"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const motivoSpento = !chiave.data?.chiave
    ? (scollegato ? "Le notifiche non sono ancora collegate" : "Sto controllando il collegamento delle notifiche")
    : undefined;

  return (
    <div className="space-y-3">
      {stato === "serve-home" ? (
        <ol className="list-decimal space-y-1 pl-5 text-corpo">
          {PASSI_IPHONE.map((p) => <li key={p}>{p}</li>)}
        </ol>
      ) : stato === "negato" ? (
        <p className="text-corpo">Le notifiche sono bloccate nelle impostazioni del browser per questo sito.</p>
      ) : stato === "non-supportato" ? (
        <p className="text-corpo">Questo browser non riceve notifiche.</p>
      ) : stato === "attivo" ? (
        <p className="text-corpo">Le notifiche sono attive su questo dispositivo.</p>
      ) : (
        <>
          <Pulsante variante="secondario" inCorso={attiva.isPending} motivoSpento={motivoSpento} onClick={() => attiva.mutate()}>
            Attiva le notifiche su questo dispositivo
          </Pulsante>
          {scollegato && <p className="text-secondaria text-grigio">Le notifiche non sono ancora collegate: si attivano appena il server ha le chiavi.</p>}
        </>
      )}
      {(disp.data?.dispositivi.length ?? 0) > 0 && (
        <ul>
          {disp.data!.dispositivi.map((d) => (
            <li key={d.id}>
              <Riga
                titolo={d.id === idSalvato ? `${d.etichetta}, questo dispositivo` : d.etichetta}
                secondaria={d.rotta ? "Non risponde, rimuovilo e riattiva" : d.lastOkAt ? `Ultima notifica ${quando(d.lastOkAt)}` : `Aggiunto ${quando(d.createdAt)}`}
                destra={<Pulsante variante="fantasma" misura="md" inCorso={rimuovi.isPending && rimuovi.variables === d.id} onClick={() => rimuovi.mutate(d.id)}>Rimuovi il dispositivo</Pulsante>}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
