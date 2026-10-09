import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { TONE_CLASSES } from "../format";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "ghost" | "danger";
export function Button({ variant = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50",
        variant === "primary" && "bg-brand text-white hover:bg-brand/90",
        variant === "ghost" && "bg-white/70 text-ink ring-1 ring-ink/10 hover:bg-white",
        variant === "danger" && "text-red-700 ring-1 ring-red-200 hover:bg-red-50",
        className,
      )}
    />
  );
}

const fieldClass = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(fieldClass, className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(fieldClass, className)} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(fieldClass, className)} />;

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={cx("flex flex-col gap-1 text-xs font-medium text-ink/60", wide && "sm:col-span-2")}>{label}{children}</label>;
}

export function Card({ title, children, accent }: { title: string; children: ReactNode; accent?: boolean }) {
  return (
    <section className={cx("rounded-2xl bg-white p-5 shadow-sm ring-1", accent ? "ring-red-300" : "ring-ink/5")}>
      <h2 className="mb-3 text-xl lowercase">{title}</h2>
      {children}
    </section>
  );
}

export function StageBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", TONE_CLASSES[tone] ?? TONE_CLASSES.neutral)}>{label}</span>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-16" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-xl rounded-2xl bg-cream p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl lowercase">{title}</h2>
          <button type="button" aria-label="Chiudi" onClick={onClose} className="text-ink/50 hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-ink/15 p-6 text-center text-sm text-ink/50">{text}</p>;
}
