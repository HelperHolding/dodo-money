import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Control de efectivo · Dodo Pizza",
  description: "Arqueos, movimientos entre cajas y cierre del día",
};

// themeColor: la barra del navegador en celular, del mismo negro que el encabezado.
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400..800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
