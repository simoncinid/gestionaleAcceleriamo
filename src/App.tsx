import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Navigate, Route, Routes, useParams } from "react-router";
import { ApiError, api } from "./api";
import { REDIRECT_1A } from "./guscio/aree";
import { Guscio } from "./guscio/Guscio";
import { Login } from "./pages/Login";
import { resetSession } from "./session";
import { SchedaLeadRotta } from "./pagine/commerciale/SchedaLead";
import { Oggi } from "./pagine/commerciale/Oggi";
import { FogliCreazione } from "./pagine/FogliCreazione";
import { Numeri } from "./pagine/commerciale/Numeri";
import { Cestino } from "./pagine/impostazioni/Cestino";
import { Fasi } from "./pagine/impostazioni/Fasi";
import { Scaletta } from "./pagine/commerciale/Scaletta";
import type { User } from "./types";

// Indirizzi della 1A: portano alle rotte nuove, conservando l'id del lead.
function Redirect({ a }: { a: string }) {
  const { id } = useParams();
  return <Navigate to={a.replace(":id", id ?? "")} replace />;
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

  if (me.isLoading) return <p className="p-10 text-ink/60">Caricamento…</p>;
  if (me.error) return <p className="p-10 text-red-700">{me.error.message}</p>;
  if (!me.data) return <Login />;

  return (
    <Routes>
      {REDIRECT_1A.map((r) => <Route key={r.da} path={r.da} element={<Redirect a={r.a} />} />)}
      <Route element={<Guscio nome={me.data.name} onEsci={esci} fogli={(crea, chiudi) => <FogliCreazione crea={crea} chiudi={chiudi} />} />}>
        <Route index element={<Navigate to="/commerciale/oggi" replace />} />
        <Route path="/commerciale/oggi" element={<Oggi />} />
        <Route path="/commerciale/scaletta" element={<Scaletta />} />
        <Route path="/commerciale/lead/:id" element={<SchedaLeadRotta />} />
        <Route path="/commerciale/numeri" element={<Numeri />} />
        <Route path="/impostazioni/dati/cestino" element={<Cestino />} />
        <Route path="/impostazioni/fasi" element={<Fasi />} />
        <Route path="*" element={<Navigate to="/commerciale/oggi" replace />} />
      </Route>
    </Routes>
  );
}
