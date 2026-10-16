/**
 * Iconos de la app: trazos de Lucide (https://lucide.dev, licencia ISC) copiados aquí para no sumar dependencias.
 * Toman el color del texto (currentColor) y miden 1em salvo que se pida otro tamaño.
 * Sin `etiqueta` son decorativos (aria-hidden); con `etiqueta`, el lector de pantalla la lee.
 */
const TRAZOS = {
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  cerrar: ["M18 6 6 18", "m6 6 12 12"],
  izquierda: ["m15 18-6-6 6-6"],
  derecha: ["m9 18 6-6-6-6"],
  abajo: ["m6 9 6 6 6-6"],
  arriba: ["m18 15-6-6-6 6"],
  regresar: ["m12 19-7-7 7-7", "M19 12H5"],
  sube: ["m5 12 7-7 7 7", "M12 19V5"],
  baja: ["M12 5v14", "m19 12-7 7-7-7"],
  igual: ["M5 9h14", "M5 15h14"],
  alerta: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  info: ["M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20", "M12 16v-4", "M12 8h.01"],
  ok: ["M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20", "m9 12 2 2 4-4"],
  bandeja: ["M22 12h-6l-2 3h-4l-2-3H2", "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"],
  descargar: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5", "M12 15V3"],
  documento: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M16 13H8", "M16 17H8", "M10 9H8"],
  mas: ["M5 12h14", "M12 5v14"],
  buscar: ["M11 3a8 8 0 1 0 0 16a8 8 0 1 0 0-16", "m21 21-4.3-4.3"],
  calendario: ["M8 2v4", "M16 2v4", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M3 10h18"],
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, tamano = "1em", etiqueta, className }: {
  nombre: NombreIcono; tamano?: number | string; etiqueta?: string; className?: string;
}) {
  return (
    <svg className={className ? `icono ${className}` : "icono"} width={tamano} height={tamano} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={etiqueta ? undefined : true} role={etiqueta ? "img" : undefined} aria-label={etiqueta} focusable="false">
      {TRAZOS[nombre].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
