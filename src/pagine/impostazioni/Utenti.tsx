import { Errore, Intestazione, Riga, Skeleton } from "../../ds";
import { useMe, useUsers } from "../../hooks";
import { IlMioProfilo } from "./Profilo";

// Spec 11.4: Tommaso e Diego, ruolo socio. Andrea non ha un accesso. Sola lettura: nessun pulsante pieno.
export function Utenti() {
  const u = useUsers();
  const me = useMe();
  return (
    // Sul largo utenti e profilo affiancati.
    <div className="grid items-start gap-8 p-4 pb-28 md:px-0 md:pt-0 @5xl:grid-cols-2">
      <div className="@5xl:col-span-full"><Intestazione eyebrow="Impostazioni" titolo="Utenti e profilo" /></div>
      <section aria-label="Utenti" className="grid gap-3">
        <h2 className="segno font-display text-sezione">Utenti</h2>
        {u.isLoading ? <Skeleton righe={2} /> : u.error ? <Errore errore={u.error} onRiprova={() => void u.refetch()} /> : (
          <ul className="grid grid-cols-1 gap-2">
            {(u.data ?? []).map((x) => <li key={x.id}><Riga titolo={x.id === me?.id ? `${x.name} (tu)` : x.name} secondaria="Socio" /></li>)}
          </ul>
        )}
        <p className="text-nota text-grigio">Andrea, l'advertiser, non ha un accesso: lavora sul suo foglio.</p>
      </section>
      <IlMioProfilo />
    </div>
  );
}
