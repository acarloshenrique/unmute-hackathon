import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "CareCircle — Cuidar é estar em círculo",
  description:
    "Conversas com propósito. Cuidado compartilhado. Demonstração de coordenação familiar com voz Agora.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
