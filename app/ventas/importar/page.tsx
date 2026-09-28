import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeImportarVentas } from "@/lib/roles";
import { FormImportar } from "./FormImportar";

export default async function PaginaImportar() {
  const { perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) redirect("/ventas");
  return (
    <>
      <div className="encabezado">
        <h1>Importar ventas</h1>
        <p>
          Sube los dos reportes de Dodo IS de un día de una sucursal: Ventas y Productos (ProductsSales).
          Primero se revisan; nada se guarda hasta que presiones Guardar.
        </p>
      </div>
      <FormImportar />
    </>
  );
}
