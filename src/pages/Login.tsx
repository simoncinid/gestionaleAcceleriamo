import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { LOGOUT_REASON_KEY, api } from "../api";
import { Button, Field, Input } from "../components/ui";
import type { User } from "../types";

export function Login() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const reason = sessionStorage.getItem(LOGOUT_REASON_KEY);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const r = await api<{ user: User }>("/auth/login", { method: "POST", json: { username: f.get("username"), password: f.get("password") } });
      sessionStorage.removeItem(LOGOUT_REASON_KEY);
      qc.setQueryData(["me"], r.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-ink/5">
        <img src="/brand/logo.svg" alt="Acceleriamo" className="h-10" />
        <h1 className="text-3xl lowercase">accedi</h1>
        {reason && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{reason}</p>}
        <Field label="Utente"><Input name="username" autoComplete="username" required autoFocus /></Field>
        <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full justify-center">{pending ? "Accesso…" : "Entra"}</Button>
      </form>
    </main>
  );
}
