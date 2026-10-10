import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Navigate, Route, Routes, useParams } from "react-router";
import { ApiError, api } from "./api";
import { REDIRECT_1A } from "./guscio/aree";
import { Guscio } from "./guscio/Guscio";
import { Login } from "./pagine/Login";
import { resetSession } from "./session";
import { SchedaLeadRotta } from "./pagine/commerciale/SchedaLead";
import { Oggi } from "./pagine/commerciale/Oggi";
import { Lunedi } from "./pagine/commerciale/Lunedi";
import { Diario } from "./pagine/commerciale/Diario";
import { Call } from "./pagine/commerciale/Call";
import { DettaglioProposta } from "./pagine/commerciale/DettaglioProposta";
import { Proposte } from "./pagine/commerciale/Proposte";
import { FogliCreazione } from "./pagine/FogliCreazione";
import { Numeri } from "./pagine/commerciale/Numeri";
import { Avvisi } from "./pagine/avvisi/Avvisi";
import { Cestino } from "./pagine/impostazioni/Cestino";
import { Fasi } from "./pagine/impostazioni/Fasi";
import { Integrazioni } from "./pagine/impostazioni/Integrazioni";
import { Modelli } from "./pagine/impostazioni/Modelli";
import { Stato } from "./pagine/impostazioni/Stato";
import { Scaletta } from "./pagine/commerciale/Scaletta";
import { InCostruzione } from "./pagine/automazioni/InCostruzione";
import { Pannello } from "./pagine/automazioni/Pannello";
import { SchedaAutomazione } from "./pagine/automazioni/Scheda";
import { Clienti } from "./pagine/commerciale/Clienti";
import { SchedaCliente } from "./pagine/commerciale/SchedaCliente";
import { Canoni } from "./pagine/economia/Canoni";
import { Costi } from "./pagine/economia/Costi";
import { Cruscotto } from "./pagine/economia/Cruscotto";
import { Fatture } from "./pagine/economia/Fatture";
import type { User } from "./types";

// Indirizzi della 1A: portano alle rotte nuove, conservando l'id del lead.
function Redirect({ a }: { a: string }) {
  const { id } = useParams();
  return <Navigate to={a.replace(":id", id ?? "")} replace />;
}

function SchedaClienteRotta() {
  const { id = "" } = useParams();
  return <SchedaCliente key={id} id={id} />;
}

function SchedaAutomazioneRotta() {
  const { id = "" } = useParams();
  return <SchedaAutomazione key={id} id={id} />;
}

export function App() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{ user: User }>("/auth/me")
        .then((r) => r.user)
        .catch((e) => {
          if (e instanceof ApiError && e.status === 401) return null;
          throw e;
        }),
    staleTime: Infinity,
  });

  useEffect(() => {
    const onLogout = () => resetSession(qc);
    window.addEventListener("acc:logout", onLogout);
    return () => window.removeEventListener("acc:logout", onLogout);
  }, [qc]);

  const esci = () => api("/auth/logout", { method: "POST" }).catch(() => null).finally(() => resetSession(qc));

  if (me.isLoading) return <p className="p-10 text-grigio">Caricamento in corso</p>;
  if (me.error) return <p role="alert" className="p-10 text-ink">{me.error.message}</p>;
  if (!me.data) return <Login />;

  return (
    <Routes>
      {REDIRECT_1A.map((r) => <Route key={r.da} path={r.da} element={<Redirect a={r.a} />} />)}
      <Route element={<Guscio nome={me.data.name} onEsci={esci} fogli={(crea, chiudi) => <FogliCreazione crea={crea} chiudi={chiudi} />} />}>
        <Route index element={<Navigate to="/commerciale/oggi" replace />} />
        <Route path="/commerciale/oggi" element={<Oggi />} />
        <Route path="/commerciale/oggi/lunedi" element={<Lunedi />} />
        <Route path="/commerciale/oggi/diario" element={<Diario />} />
        <Route path="/commerciale/scaletta" element={<Scaletta />} />
        <Route path="/commerciale/call" element={<Call />} />
        <Route path="/commerciale/proposte" element={<Proposte />} />
        <Route path="/commerciale/proposte/:id" element={<DettaglioProposta />} />
        <Route path="/commerciale/lead/:id" element={<SchedaLeadRotta />} />
        <Route path="/commerciale/numeri" element={<Numeri />} />
        <Route path="/commerciale/clienti" element={<Clienti />} />
        <Route path="/commerciale/clienti/:id" element={<SchedaClienteRotta />} />
        <Route path="/economia" element={<Cruscotto />} />
        <Route path="/economia/canoni" element={<Canoni />} />
        <Route path="/economia/fatture" element={<Fatture />} />
        <Route path="/economia/costi" element={<Costi />} />
        <Route path="/automazioni" element={<Pannello />} />
        <Route path="/automazioni/in-costruzione" element={<InCostruzione />} />
        <Route path="/automazioni/:id" element={<SchedaAutomazioneRotta />} />
        <Route path="/impostazioni/dati/cestino" element={<Cestino />} />
        <Route path="/impostazioni" element={<Stato onEsci={esci} />} />
        <Route path="/impostazioni/avvisi" element={<Avvisi />} />
        <Route path="/impostazioni/fasi" element={<Fasi />} />
        <Route path="/impostazioni/modelli" element={<Modelli />} />
        <Route path="/impostazioni/integrazioni" element={<Integrazioni />} />
        <Route path="*" element={<Navigate to="/commerciale/oggi" replace />} />
      </Route>
    </Routes>
  );
}
