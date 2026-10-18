import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeImportarVentas } from "@/lib/roles";
import { FormImportar } from "./FormImportar";
import Link from "next/link";

export default async function PaginaImportar() {
  const { perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) redirect("/ventas");
  return (
    <>
      <EncabezadoPagina titulo="Importar ventas" descripcion="Sube el archivo Datos brutos de Dodo IS: trae cada pedido del periodo, de una o varias sucursales.
          Primero se revisa; nada se guarda hasta que presiones Guardar." />
      <p><Link className="boton boton-secundario" href="/ventas/rappi">Importar historial de Rappi</Link></p>
      <p><Link href="/ventas/conciliacion">Conciliar diferencias de días históricos →</Link></p>
      <FormImportar />
    </>
  );
}
