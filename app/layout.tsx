import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

// Manrope servida desde el propio sitio: sin parpadeo de fuente ni petición a Google en cada visita.
const manrope = Manrope({ subsets: ["latin"], display: "swap", variable: "--fuente-manrope" });

export const metadata: Metadata = {
  title: "Dodo MX",
  applicationName: "Dodo MX",
  description: "Efectivo, checklists, ventas y compras de Dodo Pizza México",
};

// themeColor: la barra del navegador en celular, del mismo negro que el encabezado.
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
