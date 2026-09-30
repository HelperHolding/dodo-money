import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { ENCABEZADOS } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { FormCarga } from "./FormCarga";

export default async function CargarProveedores() {
  const { perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras");
  return (
    <>
      <div className="encabezado">
        <h1>Cargar proveedores desde Excel</h1>
        <p>Primera fila: encabezados. Un proveedor por renglón. Si algún renglón tiene un error, no se guarda ninguno.</p>
      </div>
      <section className="seccion">
        <h2>Columnas</h2>
        <p>Obligatorias: <strong>{ENCABEZADOS.filter((e) => e.obligatorio).map((e) => e.texto).join(", ")}</strong>.</p>
        <p>Opcionales: {ENCABEZADOS.filter((e) => !e.obligatorio).map((e) => e.texto).join(", ")}.</p>
        <p className="saldo-nota">
          Régimen fiscal: la clave del SAT (601, 612, 626…). Categorías: Consumible, Activo fijo, Servicio u Otro, separadas por coma.
          A la columna CLABE dale formato de texto para que Excel no le quite dígitos.
        </p>
      </section>
      <FormCarga />
    </>
  );
}
