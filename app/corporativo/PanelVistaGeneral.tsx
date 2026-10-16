import Link from "next/link";
import { BotonEnviar } from "@/components/BotonEnviar";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { Grafica } from "@/components/Grafica";
import { Icono } from "@/components/Icono";
import type { Alerta, DatosSucursal } from "@/lib/corporativo";
import { fechaTexto, pesos } from "@/lib/formato";
import { verSucursal } from "./actions";
import { SemaforoSucursales, type FilaSemaforo } from "./SemaforoSucursales";


/** Día anterior a una fecha YYYY-MM-DD (solo para el atajo "Ayer"; fechaElegida valida lo que llegue). */
const diaAnterior = (fecha: string) => new Date(Date.parse(`${fecha}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** Lo dinero/efectivo va primero y en rojo; lo de checklists, en ámbar. Solo es orden de lectura. */
const DE_DINERO: readonly Alerta[] = ["arqueos", "cierre", "boveda", "deposito", "pendientes", "comprobantes"];

/** Cada alerta de alertasDeSucursal dicha en una frase, con las mismas cifras de la tarjeta anterior. */
function textoAlerta(d: DatosSucursal, a: Alerta): string {
  const partes = (...p: (string | false)[]) => p.filter(Boolean).join(" · ");
  switch (a) {
    case "arqueos": return partes(`Arqueos con diferencia de ${pesos(d.diferenciaArqueos)}`, d.arqueosDescuadrados > 0 && `${d.arqueosDescuadrados} ${d.arqueosDescuadrados === 1 ? "descuadrado" : "descuadrados"}`);
    case "pendientes": return `${d.pendientes} ${d.pendientes === 1 ? "movimiento" : "movimientos"} por confirmar`;
    case "deposito": return "Cerró el día sin registrar la salida de efectivo";
    case "cierre": return "Falta el cierre del día";
    case "boveda": return `Bóveda con diferencia de ${pesos(d.cierre?.bovedaDiferencia ?? 0)}`;
    case "masa": return partes("Masa", d.masa.faltantes > 0 && `${d.masa.faltantes} ${d.masa.faltantes === 1 ? "hora" : "horas"} sin registro`, d.masa.fueraDeNorma > 0 && `${d.masa.fueraDeNorma} fuera de norma`);
    case "recorrido": return partes("Recorrido", d.recorrido.faltantes > 0 && `${d.recorrido.faltantes} sin hacer`, d.recorrido.conFallas > 0 && `${d.recorrido.conFallas} con ${d.recorrido.conFallas === 1 ? "falla" : "fallas"}`);
    case "rondas": return partes("Rondas", d.rondas.faltantes > 0 && `${d.rondas.faltantes} ${d.rondas.faltantes === 1 ? "hora" : "horas"} sin registro`, d.rondas.conFallas > 0 && `${d.rondas.conFallas} con ${d.rondas.conFallas === 1 ? "falla" : "fallas"}`);
    case "listas": return `Listas del turno: ${d.listas.hechas} de ${d.listas.total}`;
    case "mermas": return "Mermas del día sin cerrar";
    case "comprobantes": return `${d.sinComprobante} ${d.sinComprobante === 1 ? "gasto" : "gastos"} de caja chica sin comprobante`;
    case "amasado": return `Amasado: ${d.amasadoFuera} fuera de rango`;
    case "limpieza": return "Sin limpieza profunda registrada";
  }
}

/**
 * Presentación de la Vista general: recibe lo que la página ya consultó y calculó (no consulta nada).
 * ventas: el tablero de ventas del mes, que hace sus propias consultas.
 */
export function PanelVistaGeneral({ fecha, hoy, filas, efectivo, proveedoresResumen, ventas }: {
  fecha: string;
  hoy: string;
  filas: readonly FilaSemaforo[];
  efectivo: { cuantas: number; total: number; porRecoger: number };
  proveedoresResumen: { vencido: number; semana: number };
  ventas?: React.ReactNode;
}) {
  const conAlertas = filas.filter((f) => f.alertas.length > 0).length;
  const venta = filas.reduce((suma, f) => suma + (f.cierre?.ventaTotal ?? 0), 0);
  const conCierre = filas.filter((f) => f.cierre).length;
  const pendientes = filas.flatMap((f) => f.alertas.map((a) => ({ f, a, dinero: DE_DINERO.includes(a) })))
    .sort((x, y) => Number(y.dinero) - Number(x.dinero));
  const ayer = diaAnterior(hoy);

  return (
    <div className="panel-admin">
      <EncabezadoPagina
        titulo="Vista general"
        descripcion={<>
          {fecha === hoy ? "Hoy" : fechaTexto(fecha)} · {filas.length} {filas.length === 1 ? "sucursal" : "sucursales"} ·{" "}
          {conAlertas ? <strong className="texto-alerta">{conAlertas} con algo por revisar</strong> : "todo en orden"}
        </>}
        acciones={
          <form className="panel-dia" method="get" aria-label="Día a revisar">
            <nav className="segmentos" aria-label="Atajos de día">
              <Link href="/corporativo" aria-current={fecha === hoy ? "page" : undefined}>Hoy</Link>
              <Link href={`/corporativo?fecha=${ayer}`} aria-current={fecha === ayer ? "page" : undefined}>Ayer</Link>
            </nav>
            <label htmlFor="fecha" className="solo-lector">Día</label>
            <input id="fecha" name="fecha" type="date" defaultValue={fecha} max={hoy} />
            <button className="boton boton-secundario boton-compacto" type="submit">Ver día</button>
          </form>
        }
      />

      <div className="indicadores-marco"><section className="indicadores panel-pulso" aria-label="Pulso del día">
        <div className="indicador">
          <span className="indicador-etiqueta">Venta del día con IVA</span>
          <strong className="indicador-valor">{pesos(venta)}</strong>
          <span className="indicador-detalle">{conCierre} de {filas.length} sucursales con cierre</span>
        </div>
        <div className="indicador" data-alerta={efectivo.cuantas > 0 ? "aviso" : undefined}>
          <span className="indicador-etiqueta">Efectivo en camino</span>
          <strong className="indicador-valor">{pesos(efectivo.total)}</strong>
          <span className="indicador-cambio">{efectivo.cuantas} {efectivo.cuantas === 1 ? "salida" : "salidas"} sin recibir · {efectivo.porRecoger} por recoger</span>
          <Link className="indicador-enlace" href="/efectivo">Recibir efectivo<Icono nombre="derecha" /></Link>
        </div>
        <div className="indicador" data-alerta={proveedoresResumen.vencido > 0 ? "peligro" : undefined}>
          <span className="indicador-etiqueta">Pagos vencidos</span>
          <strong className="indicador-valor">{pesos(proveedoresResumen.vencido)}</strong>
          <span className="indicador-cambio">{proveedoresResumen.vencido > 0 ? <><Icono nombre="alerta" /> Proveedores por pagar</> : "Sin pagos vencidos"}</span>
          <Link className="indicador-enlace" href="/compras/pagos">Calendario de pagos<Icono nombre="derecha" /></Link>
        </div>
        <div className="indicador">
          <span className="indicador-etiqueta">Pagos de esta semana</span>
          <strong className="indicador-valor">{pesos(proveedoresResumen.semana)}</strong>
          <Link className="indicador-enlace" href="/compras/pagos">Ver pagos<Icono nombre="derecha" /></Link>
        </div>
      </section></div>

      {!filas.length ? <EstadoVacio titulo="No hay sucursales" descripcion="Cuando se dé de alta una sucursal, su día aparecerá aquí." icono="tienda" /> : <>
        <div className="panel-fila">
          <section className="seccion panel-revisar" aria-labelledby="t-revisar">
            <div className="seccion-cabecera">
              <h2 id="t-revisar">Por revisar</h2>
              <span className="insignia" data-tono={pendientes.length ? "peligro" : "exito"}>{pendientes.length ? `${pendientes.length} pendientes` : "Nada pendiente"}</span>
            </div>
            {!pendientes.length ? (
              <p className="panel-todo-bien"><Icono nombre="ok" tamano={22} />Todas las sucursales están en orden este día.</p>
            ) : (
              <ul className="bandeja">
                {pendientes.map(({ f, a, dinero }) => (
                  <li key={`${f.id}-${a}`} data-tono={dinero ? "peligro" : "aviso"}>
                    <span className="bandeja-icono"><Icono nombre="alerta" tamano={18} /></span>
                    <div><strong>{textoAlerta(f, a)}</strong><small>{f.nombre}</small></div>
                    <form action={verSucursal}>
                      <input type="hidden" name="sucursal_id" value={f.id} />
                      <BotonEnviar className="boton boton-secundario boton-compacto" pendiente="Abriendo…">Abrir</BotonEnviar>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="seccion" aria-labelledby="t-venta-dia">
            <div className="seccion-cabecera">
              <h2 id="t-venta-dia">Venta del día por sucursal</h2>
            </div>
            <Grafica titulo="Venta del día por sucursal" barras={[...filas].sort((a, b) => (b.cierre?.ventaTotal ?? 0) - (a.cierre?.ventaTotal ?? 0)).map((f) => ({
              clave: f.id, etiqueta: f.nombre, valor: f.cierre?.ventaTotal ?? 0, alerta: !f.cierre && f.alertas.includes("cierre"),
              texto: f.cierre ? pesos(f.cierre.ventaTotal) : "Sin cierre",
            }))} />
            <p className="saldo-nota">Venta capturada en el cierre de cada sucursal.</p>
          </section>
        </div>

        <section className="seccion" aria-labelledby="t-semaforo">
          <div className="seccion-cabecera">
            <div>
              <h2 id="t-semaforo">Semáforo de sucursales</h2>
              <p className="saldo-nota">Toca una sucursal para ver su día completo.</p>
            </div>
            <ul className="semaforo-leyenda" aria-label="Qué significa cada señal">
              <li><span className="senal" data-estado="ok"><Icono nombre="ok" /></span>En orden</li>
              <li><span className="senal" data-estado="neutro"><Icono nombre="info" /></span>En curso o informativo</li>
              <li><span className="senal" data-estado="alerta"><Icono nombre="alerta" /></span>Revisar</li>
            </ul>
          </div>
          <SemaforoSucursales filas={filas} />
        </section>
      </>}


      {ventas}
    </div>
  );
}
