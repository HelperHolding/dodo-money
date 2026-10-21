import Link from "next/link";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { Icono } from "@/components/Icono";
import styles from "./banca.module.css";
import { obtenerPerfil } from "@/lib/contexto";
import { pesos } from "@/lib/formato";
import { Banregio, leerCuentasBanca, type FiltrosBanca } from "./Banregio";

const FUENTES = [
  { id: "banregio", nombre: "Banregio", tipo: "Cuenta bancaria", descripcion: "Disponibilidad y movimientos bancarios.", columnas: ["Fecha", "Razón social", "Sucursal", "Concepto / referencia", "Cargo", "Abono", "Saldo", "Conciliación"] },
  { id: "rappi", nombre: "Rappi", tipo: "Plataforma por liquidar", descripcion: "Ventas, descuentos, comisiones y depósitos de Rappi.", columnas: ["Periodo / fecha", "Razón social", "Sucursal", "Referencia", "Venta bruta", "Descuentos / ajustes", "Comisiones", "Neto a recibir", "Depósito / estado"] },
  { id: "netpay", nombre: "NetPay", tipo: "Plataforma por liquidar", descripcion: "Cobros con tarjeta, devoluciones y liquidaciones.", columnas: ["Fecha de operación", "Razón social", "Sucursal", "Referencia / lote", "Cobros", "Devoluciones", "Comisiones", "Neto a recibir", "Depósito / estado"] },
  { id: "dlocal", nombre: "dLocal", tipo: "Plataforma por liquidar", descripcion: "Cobros, ajustes, comisiones y liquidaciones de dLocal.", columnas: ["Fecha de operación", "Razón social", "Sucursal", "Referencia", "Cobros", "Ajustes", "Comisiones", "Neto a recibir", "Depósito / estado"] },
] as const;

export default async function PaginaBanca({ searchParams }: { searchParams: Promise<FiltrosBanca> }) {
  const q = await searchParams;
  const { vista } = q;
  const {supabase,perfil}=await obtenerPerfil();
  const [cuentas,pendientes]=await Promise.all([leerCuentasBanca(supabase),supabase.from("banca_movimientos").select("id",{count:"exact",head:true})]);
  if(pendientes.error) throw Error("No se pudo consultar el total de movimientos bancarios.");
  const saldo=cuentas.length&&cuentas.every(c=>c.saldo_final!==null)?cuentas.reduce((s,c)=>s+Number(c.saldo_final),0):null;
  const fuente = FUENTES.find(f => f.id === vista);
  const resumen = !fuente && vista !== "conciliacion";
  return <div className={styles.pagina}>
    <EncabezadoPagina titulo="Banca" descripcion="Disponibilidad, liquidaciones y conciliación del grupo." acciones={<Link className="boton boton-secundario" href="/compras/pagos"><Icono nombre="calendario" />Calendario de pagos</Link>} />
    <p className={styles.aviso}><Icono nombre="info" />Banregio se actualiza con reportes importados. Las liquidaciones de plataformas y la conciliación están pendientes de incorporar.</p>
    <div className={styles.indicadores}>
      {[
        ["Último saldo reportado", cuentas.length?`Banregio · ${cuentas.length} cuenta(s) · cada reporte tiene su fecha de corte`:"Banregio · pendiente de estado de cuenta",saldo===null?"Sin datos":pesos(saldo)],
        ["Pendiente por recibir", "Rappi, NetPay y dLocal · pendiente de liquidaciones","Sin datos"],
        ["Por conciliar", "Movimientos bancarios sin asociar",cuentas.length?String(pendientes.count??0):"Sin datos"],
      ].map(([titulo, detalle,importe]) => <section className={styles.indicador} key={titulo}><h2>{titulo}</h2><strong>{importe}</strong><p>{detalle}</p></section>)}
    </div>
    <nav className={styles.pestanas} aria-label="Vistas de banca">
      <Link href="/banca" aria-current={resumen ? "page" : undefined}>Resumen</Link>
      {FUENTES.map(f => <Link key={f.id} href={`/banca?vista=${f.id}`} aria-current={fuente?.id === f.id ? "page" : undefined}>{f.nombre}</Link>)}
      <Link href="/banca?vista=conciliacion" aria-current={vista === "conciliacion" ? "page" : undefined}>Conciliación</Link>
    </nav>
    {resumen ? <>
      <section aria-label="Fuentes de banca" className={styles.fuentes}>
        {FUENTES.map(f => <Link className={styles.fuente} href={`/banca?vista=${f.id}`} key={f.id}>
          <div className={styles.tituloFuente}><Icono nombre={f.id === "banregio" ? "banco" : "cartera"} /><h2>{f.nombre}</h2><Icono nombre="derecha" /></div>
          <span>{f.tipo}</span><p>{f.descripcion}</p><div className={styles.estado}>{f.id==="banregio"&&cuentas.length?`${cuentas.length} cuenta(s) con reportes`:"Pendiente de reportes"}</div>
        </Link>)}
      </section>
      <section className={styles.panel}><h2>Del cobro al depósito</h2><ol className={styles.pasos}><li><strong>1. Operación</strong><span>Ventas y pagos registrados en Dodo MX.</span></li><li><strong>2. Liquidación</strong><span>Bruto, comisiones, ajustes y neto de cada plataforma.</span></li><li><strong>3. Banco</strong><span>Depósito recibido y asociación con su liquidación.</span></li></ol><p className={styles.nota}>Las ventas ya registradas no se vuelven a sumar al recibir el depósito. Caja y bóveda se mantienen separadas del saldo bancario.</p></section>
    </> : fuente?.id==="banregio" ? <Banregio db={supabase} cuentas={cuentas} edita={perfil.rol==="admin"} q={q}/> : <section className={styles.panel}>
      <div className={styles.encabezado}><div><h2>{fuente?.nombre ?? "Conciliación"}</h2><p>{fuente?.descripcion ?? "Relacionar movimientos bancarios con liquidaciones, pagos y depósitos de ventas."}</p></div><span className={styles.estado}>Pendiente de reportes</span></div>
      <div className={styles.tabla}><table><caption className="solo-lector">{fuente?.nombre ?? "Conciliación"} · estructura de movimientos</caption><thead><tr>{(fuente?.columnas ?? ["Fecha", "Razón social", "Sucursal", "Movimiento bancario", "Origen / documento", "Importe", "Diferencia", "Estado"]).map(c => <th scope="col" key={c}>{c}</th>)}</tr></thead><tbody><tr><td colSpan={fuente?.columnas.length ?? 8}><div className={styles.vacio}><Icono nombre="bandeja" tamano={32} /><h3>{fuente ? `Todavía no hay movimientos de ${fuente.nombre}` : "Todavía no hay movimientos para conciliar"}</h3><p>{fuente ? "La importación se habilitará cuando validemos el formato del reporte. No hay conexión automática activa." : "Primero incorporaremos los reportes de las plataformas y los movimientos de Banregio."}</p></div></td></tr></tbody></table></div>
      {fuente?.id === "rappi" && <p className={styles.nota}>Las ventas de Rappi importadas en Ventas no representan por sí solas saldo por cobrar ni depósitos conciliados. <Link href="/ventas">Consultar ventas →</Link></p>}
      <details className={styles.detalle}><summary>Qué necesitamos para continuar</summary><p>{fuente ? `Reporte de liquidaciones de ${fuente.nombre}, con referencias, importes brutos, descuentos, comisiones, neto y fechas de depósito. Confirmaremos las columnas con el archivo real.` : "Se revisarán las coincidencias por referencia, importe y fecha antes de confirmar una asociación. Importar un movimiento no marcará automáticamente una factura como pagada."}</p></details>
    </section>}
  </div>;
}
