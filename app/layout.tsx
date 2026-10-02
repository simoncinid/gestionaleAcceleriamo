import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acceleriamo OS",
  description: "Gestionale interno Acceleriamo per lead, clienti, task, pagamenti e lavori.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="antialiased">{children}</body>
    </html>
  );
}
