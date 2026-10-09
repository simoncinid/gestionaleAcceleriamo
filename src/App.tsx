import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router";
import { ApiError, api } from "./api";
import { Layout } from "./pages/Layout";
import { Login } from "./pages/Login";
import { resetSession } from "./session";
import { Placeholder } from "./pages/Placeholder";
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
        <Route path="oggi" element={<Placeholder title="oggi" />} />
        <Route path="scaletta" element={<Placeholder title="scaletta" />} />
        <Route path="lead/:id" element={<Placeholder title="lead" />} />
        <Route path="numeri" element={<Placeholder title="numeri" />} />
        <Route path="cestino" element={<Placeholder title="cestino" />} />
        <Route path="fasi" element={<Placeholder title="fasi" />} />
        <Route path="*" element={<Navigate to="/oggi" replace />} />
      </Route>
    </Routes>
  );
}
