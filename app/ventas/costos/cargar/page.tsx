import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyMX } from "@/lib/formato";
import { puedeImportarVentas } from "@/lib/roles";
import { FormCargarCostos } from "./FormCargarCostos";

export default async function CargarCostos() {
  const { perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) redirect("/ventas");
  return (
    <>
      <EncabezadoPagina titulo="Cargar costos desde Excel" descripcion="Sube el Excel del menú. Cada renglón se empareja con su producto de Dodo IS; las variantes Thin toman el costo de su tamaño
          y la mitad y mitad, el promedio de los sabores. Primero se revisa; nada se guarda hasta que presiones Guardar." />
      <FormCargarCostos fechaPorDefecto={`${hoyMX().slice(0, 8)}01`} />
    </>
  );
}
