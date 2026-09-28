import { BotonEnviar } from "@/components/BotonEnviar";
import { hora } from "@/lib/formato";
import { revisarRegistro } from "./acciones-revisar";

export function Revisar({
  tipo, id, volver, revisadoPor, revisadoEn, puede,
}: {
  tipo: "checklist" | "amasado" | "limpieza"; id: string; volver: string;
  revisadoPor: string | null | undefined; revisadoEn: string | null; puede: boolean;
}) {
  if (revisadoPor) {
    return <span className="estado estado-confirmado">Revisado · {revisadoPor}{revisadoEn ? ` · ${hora(revisadoEn)}` : ""}</span>;
  }
  if (!puede) return <span className="estado estado-pendiente">Por revisar</span>;
  return (
    <form action={revisarRegistro}>
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="volver" value={volver} />
      <BotonEnviar className="boton boton-secundario" pendiente="…">Revisado</BotonEnviar>
    </form>
  );
}
