import type { ReactNode } from "react";

const dibujos: Record<string, ReactNode> = {
  Ventas: <><path d="M4 19V5M4 19h16M8 15v-4m5 4V8m5 7V4" /></>,
  Rappi: <><path d="M3 6h11v12H3zM14 10h4l3 4v4h-3M14 18h-3" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  "Compras y pagos": <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 7h6M9 11h6M9 15h3" /></>,
  "P&L": <><path d="M4 19V5M4 19h16M7 14l4-4 4 2 5-7M16 5h4v4" /></>,
  Retenciones: <><path d="m3 9 9-6 9 6H3ZM5 10v7m7-7v7m7-7v7M3 21h18M4 17h16" /></>,
  Mermas: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6" /></>,
  "Costeo y materiales": <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></>,
  Checklists: <><rect x="6" y="4" width="14" height="17" rx="2" /><path d="M10 4V2h6v2M9 10l2 2 4-4M10 16h6" /></>,
};

/** El título de la tarjeta ya identifica el enlace; el dibujo es decorativo. */
export function IconoInicio({ nombre }: { nombre: string }) {
  return <span className="inicio-icono" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      {dibujos[nombre] ?? dibujos.Checklists}
    </svg>
  </span>;
}
