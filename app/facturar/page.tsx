import { sucursalFacturacion } from "@/lib/facturacion/servidor";
import { REGIMENES } from "@/lib/compras/proveedores";
import { Flujo } from "./Flujo";
import s from "./facturar.module.css";
export const dynamic = "force-dynamic";
// Las acciones de esta página pueden encadenar una búsqueda y una llamada a Facturapi de hasta 25 s.
export const maxDuration = 60;
export const metadata = { title: "Factura tu ticket · Dodo Pizza" };

export default async function Facturar() {
  const sucursal = await sucursalFacturacion();
  return (
    <main className={s.pagina}>
      <header className={s.encabezado}><img src="/logo-dodo.png" alt="Dodo Pizza" width={56} height={56} /><h1>Factura tu ticket</h1></header>
      <p className={s.nota}>Sucursal {sucursal.nombre}. Solo tickets del mes en curso.</p>
      <Flujo regimenes={REGIMENES} />
    </main>
  );
}
