import { Imprimir } from "@/components/Imprimir";
import { fechaMX, fechaTexto, hora } from "@/lib/formato";

/** Encabezado de los reportes para imprimir: título, sucursal, quién lo generó y cuándo. */
export function EncabezadoReporte({ titulo, sucursal, detalle, generadoPor }: {
  titulo: string; sucursal: string; detalle: string; generadoPor: string;
}) {
  const ahora = new Date().toISOString();
  return (
    <>
      <style>{"@media print { .no-imprimir { display: none !important; } body { background: #fff; } .seccion { break-inside: avoid-page; } }"}</style>
      <div className="acciones no-imprimir"><Imprimir /></div>
      <section className="seccion">
        <div className="tarjeta-encabezado">
          <div>
            <h1>{titulo}</h1>
            <p>Dodo Pizza {sucursal} · {detalle}</p>
            <p className="saldo-nota">Generado por {generadoPor} el {fechaTexto(fechaMX(ahora))} a las {hora(ahora)}</p>
          </div>
          <img src="/logo-dodo.png" alt="Dodo Pizza" width={48} height={48} />
        </div>
      </section>
    </>
  );
}
