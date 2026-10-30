import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ApiError, LOGOUT_REASON_KEY, api } from "../api";
import { Campo, Pulsante } from "../ds";
import type { User } from "../types";

const motivoUscita = () => (typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(LOGOUT_REASON_KEY));

// Gli errori del server arrivano già in italiano; tutto il resto (fetch che lancia senza rete) è la connessione.
export const messaggioAccesso = (err: unknown) =>
  err instanceof ApiError && err.message ? err.message : "Connessione assente, riprova";

// Accesso: logo, due campi, un solo pulsante pieno. Gli errori restano calmi, sotto i campi.
export function Login() {
  const qc = useQueryClient();
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [motivo] = useState(motivoUscita);

  async function entra(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setInCorso(true);
    setErrore(null);
    try {
      const r = await api<{ user: User }>("/auth/login", { method: "POST", json: { username: f.get("username"), password: f.get("password") } });
      sessionStorage.removeItem(LOGOUT_REASON_KEY);
      qc.setQueryData(["me"], r.user);
    } catch (err) {
      setErrore(messaggioAccesso(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-crema p-6">
      <form onSubmit={entra} className="grid w-full max-w-sm gap-5 rounded-blocco border border-sabbia bg-avorio p-8">
        <div className="grid gap-3">
          <img src="/brand/logo.svg" alt="Acceleriamo" className="h-10 justify-self-start" />
          <h1 className="font-display text-sezione">Entra in Acceleriamo</h1>
        </div>
        {motivo && <p className="rounded-controllo border border-sabbia bg-crema p-3 text-nota">{motivo}</p>}
        <Campo etichetta="Utente" name="username" autoComplete="username" required autoFocus />
        <Campo etichetta="Password" name="password" type="password" autoComplete="current-password" required />
        {errore && <p role="alert" className="text-nota text-ink">{errore}</p>}
        <Pulsante variante="primario" misura="lg" type="submit" inCorso={inCorso} className="w-full justify-center">Entra</Pulsante>
      </form>
    </main>
  );
}
