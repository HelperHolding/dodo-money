import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { ENCABEZADOS, ENCABEZADOS_ARTICULOS } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { cargarArticulos, cargarProveedores } from "./acciones";
import { FormCarga } from "./FormCarga";

const lista = (encabezados: readonly { texto: string; obligatorio: boolean }[], obligatorio: boolean) =>
  encabezados.filter((e) => e.obligatorio === obligatorio).map((e) => e.texto).join(", ");

export default async function CargarExcel() {
  const { perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras");
  return (
    <>
      <div className="encabezado">
        <h1>Cargar desde Excel</h1>
        <p>Primera fila: encabezados. Un registro por renglón. Si algún renglón tiene un error, no se guarda ninguno y te decimos cuál corregir.</p>
      </div>

      <section className="seccion">
        <h2>Proveedores</h2>
        <p>Obligatorias: <strong>{lista(ENCABEZADOS, true)}</strong>.</p>
        <p>Opcionales: {lista(ENCABEZADOS, false)}.</p>
        <p className="saldo-nota">
          Régimen fiscal: la clave del SAT (601, 612, 626…). Categorías: Consumible, Activo fijo, Servicio u Otro, separadas por coma.
          A la columna CLABE dale formato de texto para que Excel no le quite dígitos.
        </p>
      </section>
      <FormCarga que="proveedores" accion={cargarProveedores} />

      <section className="seccion">
        <h2>Artículos</h2>
        <p>Obligatorias: <strong>{lista(ENCABEZADOS_ARTICULOS, true)}</strong>.</p>
        <p>Opcionales: {lista(ENCABEZADOS_ARTICULOS, false)}.</p>
        <p className="saldo-nota">
          Tipo: Consumible, Activo fijo, Servicio u Otro. IVA: 16, 0 o Exento (vacío = 16). El ID de insumo de Dodo IS solo va en consumibles
          y es la columna ID del reporte Incoming supplies. Un nombre que ya está en el catálogo cuenta como error.
        </p>
      </section>
      <FormCarga que="articulos" accion={cargarArticulos} />
    </>
  );
}
