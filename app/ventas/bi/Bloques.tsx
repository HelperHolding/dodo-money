import Link from "next/link";
import { BarrasHorizontales } from "@/components/BarrasHorizontales";
import { Icono } from "@/components/Icono";
import { MedidorSemicircular } from "@/components/MedidorSemicircular";
import { pesos, porcentaje } from "@/lib/formato";
import { nombre, NOMBRE_CANAL } from "@/lib/ventas/biNombres";
import { cambioRelativo } from "@/lib/ventas/tablero";

export type Kpi = { clave: string; etiqueta: string; valor: string; cambio: number | null; detalle?: string };

/** El cambio se lee por flecha y signo, no solo por color; en estos KPIs subir siempre es bueno. */
function Cambio({ cambio }: { cambio: number | null }) {
  if (cambio === null) return <span className="indicador-cambio">Sin comparación</span>;
  const sentido = cambio > 0 ? "sube" : cambio < 0 ? "baja" : "igual";
  return (
    <span className="indicador-cambio" data-favorable={cambio === 0 ? undefined : cambio > 0 ? "si" : "no"}>
      <Icono nombre={sentido} etiqueta={sentido === "sube" ? "Sube" : sentido === "baja" ? "Baja" : "Sin cambio"} />
      {cambio > 0 ? "+" : cambio < 0 ? "−" : ""}{porcentaje(Math.abs(cambio))}
    </span>
  );
}

/** Fila de KPIs (bloque 1). */
export function Kpis({ lista }: { lista: readonly Kpi[] }) {
  return (
    <div className="bi-kpis">
      {lista.map((k) => (
        <div key={k.clave} className="indicador">
          <span className="indicador-etiqueta">{k.etiqueta}</span>
          <strong className="indicador-valor">{k.valor}</strong>
          <Cambio cambio={k.cambio} />
          {k.detalle && <span className="indicador-detalle">{k.detalle}</span>}
        </div>
      ))}
    </div>
  );
}

type Objetivo = {
  titulo: string; venta: number; objetivo: number | null; nombreObjetivo: string; medidor: string; diferencia: string;
  aviso?: string | null; faltan?: { mes: string; sucursales: string[] }[];
};

/** Una fila de medidores: barras venta y objetivo · medidor % · diferencia. Sin objetivo, «Sin dato» en lugar de 0. */
function FilaMedidor({ o }: { o: Objetivo }) {
  const pct = o.objetivo ? o.venta / o.objetivo : null;
  const diferencia = o.objetivo === null ? null : o.venta - o.objetivo;
  return (
    <>
      <div className="bi-medidores">
        <section className="seccion bi-bloque">
          <h2>{o.titulo}</h2>
          {o.objetivo === null ? <p className="vacio">Sin {o.nombreObjetivo} para comparar.</p> : (
            <BarrasHorizontales titulo={o.titulo} filas={[
              { clave: "objetivo", etiqueta: o.nombreObjetivo, valor: o.objetivo, detalle: pesos(o.objetivo) },
              { clave: "venta", etiqueta: "Venta", valor: o.venta, detalle: pesos(o.venta) },
            ]} />
          )}
        </section>
        <section className="seccion bi-bloque">
          <h2>{o.medidor}</h2>
          <MedidorSemicircular titulo={`Venta contra ${o.nombreObjetivo}`} valor={pct} maximo={1} etiqueta={porcentaje(pct)} />
        </section>
        <section className="seccion bi-bloque">
          <h2>{o.diferencia}</h2>
          <p className="bi-diferencia" data-signo={diferencia === null ? undefined : diferencia >= 0 ? "mas" : "menos"}>
            {diferencia === null ? "Sin dato" : `${diferencia >= 0 ? "+" : "−"}${pesos(Math.abs(diferencia))}`}
          </p>
          {diferencia !== null && <p className="bi-nota">{diferencia >= 0 ? `Arriba de ${o.nombreObjetivo}` : `Faltan para llegar a ${o.nombreObjetivo}`}</p>}
        </section>
      </div>
      {o.aviso && <p className="aviso aviso-info">{o.aviso}</p>}
      {o.faltan && o.faltan.length > 0 && (
        <div className="aviso aviso-info">
          <p>Falta la meta de venta de algunas sucursales (no entran a la meta):</p>
          <ul className="bi-faltan">
            {o.faltan.map((x) => (
              <li key={x.mes}><Link href={`/finanzas/parametros?mes_meta=${x.mes}`}>{x.mes}</Link>: {x.sucursales.join(", ")}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** Bloque 2: P.E. y meta, dos filas de tres. */
export function Medidores({ pe, meta }: { pe: Objetivo; meta: Objetivo }) {
  return <><FilaMedidor o={pe} /><FilaMedidor o={meta} /></>;
}

type Producto = { nombre: string; canal: string; ventas: number | string; piezas: number | string };

/** Bloque 8: los 20 productos con más venta, con su cambio contra la comparación (por nombre y canal). */
export function Ranking({ productos, anteriores, total }: { productos: readonly Producto[]; anteriores: readonly Producto[]; total: number }) {
  if (!productos.length) return <p className="vacio">Sin datos en el periodo.</p>;
  const antes = new Map(anteriores.map((p) => [`${p.nombre}|${p.canal}`, Number(p.ventas)]));
  return (
    <div className="tabla-contenedor">
      <table className="tabla tabla-tarjetas">
        <thead><tr><th>#</th><th>Producto</th><th>Canal</th><th>Venta</th><th>Piezas</th><th>% del total</th><th>Cambio</th></tr></thead>
        <tbody>
          {productos.slice(0, 20).map((p, i) => {
            const venta = Number(p.ventas), previo = antes.get(`${p.nombre}|${p.canal}`) ?? null;
            const cambio = cambioRelativo(venta, previo);
            return (
              <tr key={`${p.nombre}|${p.canal}`}>
                <td data-label="#">{i + 1}</td>
                <td data-label="Producto">{p.nombre}</td>
                <td data-label="Canal">{nombre(NOMBRE_CANAL, p.canal)}</td>
                <td data-label="Venta" className="bi-num">{pesos(venta)}</td>
                <td data-label="Piezas" className="bi-num">{Number(p.piezas).toLocaleString("es-MX")}</td>
                <td data-label="% del total" className="bi-num">{porcentaje(total > 0 ? venta / total : null)}</td>
                <td data-label="Cambio" className="bi-num"><Cambio cambio={cambio} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
