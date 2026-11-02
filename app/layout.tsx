import type { Metadata, Viewport } from "next";
import { Manrope, Rubik } from "next/font/google";
import "./globals.css";
import "./sucursal.css";

// Manrope servida desde el propio sitio: sin parpadeo de fuente ni petición a Google en cada visita.
const manrope = Manrope({ subsets: ["latin"], display: "swap", variable: "--fuente-manrope" });
// Rubik para las letras de canal del letrero, títulos y cifras (tema de sucursal, app/sucursal.css).
const rubik = Rubik({ subsets: ["latin"], weight: ["600", "700", "800"], display: "swap", variable: "--fuente-rubik" });

/**
 * Antes de pintar: modo noche guardado en este navegador y, en la primera carga de la sesión, el encendido
 * de las tiras LED y el letrero (la marca se quita al terminar para que no se repita al navegar).
 */
const LUZ = `try{var h=document.documentElement;if(localStorage.getItem("luz")==="noche")h.dataset.luz="noche";if(!sessionStorage.getItem("encendido")){sessionStorage.setItem("encendido","1");h.dataset.encender="";setTimeout(function(){delete h.dataset.encender},2200)}}catch(e){}`;

export const metadata: Metadata = {
  title: "Dodo MX",
  applicationName: "Dodo MX",
  description: "Efectivo, checklists, ventas y compras de Dodo Pizza México",
};

// themeColor: la barra del navegador en celular, del mismo negro que el encabezado.
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${manrope.variable} ${rubik.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: LUZ }} /></head>
      <body>{children}</body>
    </html>
  );
}
