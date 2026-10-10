import { cx } from "./cx";

// Logo del cliente in un tondo inchiostro (i loghi sono pensati per fondo scuro). Senza logo: l'iniziale, come gli avatar.
export function LogoCliente({ logo, nome, misura = 28 }: { logo?: string | null; nome: string; misura?: number }) {
  const stile = { width: misura, height: misura };
  if (logo) return <img src={logo} alt="" aria-hidden style={stile} className="shrink-0 rounded-full bg-ink object-cover" />;
  return (
    <span aria-hidden style={{ ...stile, fontSize: Math.round(misura * 0.45) }} className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-sabbia font-display font-semibold text-ink")}>
      {nome.trim().charAt(0).toUpperCase()}
    </span>
  );
}
