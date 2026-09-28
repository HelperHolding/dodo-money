import Link from "next/link";
import type { EstadoLista, FilaLista } from "@/lib/zonas";

const TEXTO: Record<EstadoLista, string> = { pendiente: "Pendiente", hecho: "Hecho", revisado: "Revisado", "no-aplica": "—" };

export function TarjetasListas({ filas, enlace }: { filas: FilaLista[]; enlace: boolean }) {
  return (
    <div className="tarjetas">
      {filas.map((f) => (
        <article key={f.checklistId} className="tarjeta zona" aria-label={f.nombre}>
          <h3>{f.nombre}</h3>
          <ul className="estados-lista">
            {f.celdas.filter((c) => c.estado !== "no-aplica").map((c) => (
              <li key={c.momento}>
                <span>{c.titulo}</span>
                {enlace ? (
                  <Link className="estado-lista" data-estado={c.estado} href={`/checklists/turno?lista=${f.clave}&momento=${c.momento}`}>
                    {TEXTO[c.estado]}
                  </Link>
                ) : (
                  <span className="estado-lista" data-estado={c.estado}>{TEXTO[c.estado]}</span>
                )}
              </li>
            ))}
            {f.celdas.every((c) => c.estado === "no-aplica") && <li><span className="saldo-nota">Nada que hacer hoy.</span></li>}
          </ul>
        </article>
      ))}
    </div>
  );
}
