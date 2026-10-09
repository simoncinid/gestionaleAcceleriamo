import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router";
import { ApiError, api } from "./api";
import { Layout } from "./pages/Layout";
import { Login } from "./pages/Login";
import { resetSession } from "./session";
import { LeadPage } from "./pages/LeadPage";
import { Oggi } from "./pages/Oggi";
import { Numeri } from "./pages/Numeri";
import { Cestino } from "./pages/Cestino";
import { Fasi } from "./pages/Fasi";
import { Scaletta } from "./pages/Scaletta";
import type { User } from "./types";

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

  if (me.isLoading) return <p className="p-10 text-ink/60">Caricamento…</p>;
  if (me.error) return <p className="p-10 text-red-700">{me.error.message}</p>;
  if (!me.data) return <Login />;

  return (
    <Routes>
      <Route element={<Layout user={me.data} />}>
        <Route index element={<Navigate to="/oggi" replace />} />
        <Route path="oggi" element={<Oggi />} />
        <Route path="scaletta" element={<Scaletta />} />
        <Route path="lead/:id" element={<LeadPage />} />
        <Route path="numeri" element={<Numeri />} />
        <Route path="cestino" element={<Cestino />} />
        <Route path="fasi" element={<Fasi />} />
        <Route path="*" element={<Navigate to="/oggi" replace />} />
      </Route>
    </Routes>
  );
}
