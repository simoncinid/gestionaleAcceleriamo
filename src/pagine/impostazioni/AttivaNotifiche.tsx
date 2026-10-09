import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Pulsante, Riga } from "../../ds";
import { quando } from "../../format";
import { ambienteCorrente, attivaPush, etichettaDispositivo, iscrizioneEsistente, statoPush, type Ambiente } from "../../push";

type Dispositivo = { id: string; etichetta: string; createdAt: number; lastOkAt: number | null; rotta: boolean };

const PASSI_IPHONE = [
  "Apri Acceleriamo OS in Safari.",
  "Tocca il pulsante Condividi, il quadrato con la freccia in su.",
  "Scegli \"Aggiungi alla schermata Home\", poi apri l'app dalla Home e torna qui.",
];

// Spec 8.3: il permesso del browser si chiede solo dopo il tocco sul pulsante (secondario, mai primario).
export function AttivaNotifiche({ ambiente }: { ambiente?: Ambiente }) {
  const qc = useQueryClient();
  const [amb] = useState(() => ambiente ?? ambienteCorrente());
  const chiave = useQuery({ queryKey: ["push-chiave"], queryFn: () => api<{ chiave: string | null }>("/push-subscriptions/chiave") });
  const disp = useQuery({ queryKey: ["push-dispositivi"], queryFn: () => api<{ dispositivi: Dispositivo[] }>("/push-subscriptions") });
  const [iscritto, setIscritto] = useState(false);
  const stato = statoPush(amb, iscritto);
  // Senza chiave pubblica VAPID le notifiche non sono collegate: il pulsante resta spento, senza errori.
  const scollegato = chiave.data !== undefined && !chiave.data.chiave;

  useEffect(() => {
    if (ambiente || amb.permesso !== "granted" || !amb.haPush) return;
    iscrizioneEsistente().then((e) => setIscritto(e !== null)).catch(() => undefined);
  }, [ambiente, amb]);

  const attiva = useMutation({
    mutationFn: async () => {
      const sub = await attivaPush(chiave.data!.chiave!);
      await api("/push-subscriptions", { method: "POST", json: { ...sub, etichetta: etichettaDispositivo(amb.ua) } });
    },
    onSuccess: () => {
      setIscritto(true);
      toast.success("Notifiche attive su questo dispositivo");
      qc.invalidateQueries({ queryKey: ["push-dispositivi"] });
    },
    onError: () => toast.error("Le notifiche non si sono attivate. Controlla il permesso del browser."),
  });
  const rimuovi = useMutation({
    mutationFn: (id: string) => api(`/push-subscriptions/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["push-dispositivi"] }),
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
                titolo={d.etichetta}
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
