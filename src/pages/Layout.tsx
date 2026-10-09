import { useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router";
import { api } from "../api";
import { cx } from "../components/ui";
import { resetSession } from "../session";
import type { User } from "../types";

const NAV = [
  { to: "/oggi", label: "Oggi" },
  { to: "/scaletta", label: "Scaletta" },
  { to: "/numeri", label: "Numeri" },
  { to: "/cestino", label: "Cestino" },
  { to: "/fasi", label: "Fasi" },
];

export function Layout({ user }: { user: User }) {
  const qc = useQueryClient();
  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => null);
    resetSession(qc);
  }
  return (
    <div className="min-h-screen md:flex">
      <aside className="flex items-center gap-4 border-b border-ink/10 bg-white/70 px-4 py-3 md:sticky md:top-0 md:h-screen md:w-56 md:flex-col md:items-stretch md:border-b-0 md:border-r md:px-5 md:py-6">
        <img src="/brand/logo.svg" alt="Acceleriamo" className="h-8 md:mb-6 md:self-start" />
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => cx("rounded-lg px-3 py-2 text-sm font-medium", isActive ? "bg-brand text-white" : "text-ink/70 hover:bg-ink/5")}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto text-sm md:ml-0 md:mt-auto">
          <p className="font-medium">{user.name}</p>
          <button type="button" onClick={logout} className="text-ink/50 hover:text-brand">Esci</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
