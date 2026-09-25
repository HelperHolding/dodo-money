import { etiquetaHora, type EstadoCasilla } from "@/lib/franjas";

const TEXTO: Record<EstadoCasilla, string> = {
  ok: "Listo",
  alerta: "Revisar",
  abierta: "Ahora",
  falta: "Falta",
  futura: "—",
};

export function Franjas({ titulo, casillas }: { titulo: string; casillas: { hora: number; estado: EstadoCasilla }[] }) {
  return (
    <ul className="franjas" aria-label={titulo}>
      {casillas.map((c) => (
        <li key={c.hora} className="franja" data-estado={c.estado}>
          <strong>{etiquetaHora(c.hora)}</strong>
          <span>{TEXTO[c.estado]}</span>
        </li>
      ))}
    </ul>
  );
}
