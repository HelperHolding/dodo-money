import type { Metadata, Viewport } from "next";
import { Archivo, Manrope } from "next/font/google";
import "./globals.css";
import "./sucursal.css";

// Manrope servida desde el propio sitio: sin parpadeo de fuente ni petición a Google en cada visita.
const manrope = Manrope({ subsets: ["latin"], display: "swap", variable: "--fuente-manrope" });
// Archivo para títulos y cifras: sustituto libre de Rooftop (la licencia de Rooftop es de escritorio; ver app/marca.css).
const archivo = Archivo({ subsets: ["latin"], weight: ["600", "700", "800"], display: "swap", variable: "--fuente-archivo" });

/** Antes de pintar: modo noche guardado en este navegador (sin parpadeo de tema). */
const LUZ = `try{if(localStorage.getItem("luz")==="noche")document.documentElement.dataset.luz="noche"}catch(e){}`;

export const metadata: Metadata = {
  title: "Dodo MX",
  applicationName: "Dodo MX",
  description: "Efectivo, checklists, ventas y compras de Dodo Pizza México",
};

// themeColor: la barra del navegador en celular, del mismo negro que el encabezado.
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${manrope.variable} ${archivo.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: LUZ }} /></head>
      <body>{children}</body>
    </html>
  );
}
