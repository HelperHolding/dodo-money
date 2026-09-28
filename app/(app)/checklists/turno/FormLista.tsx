import { BotonEnviar } from "@/components/BotonEnviar";
import { FormPuntos } from "../FormPuntos";
import { registrarLista } from "./actions";

export function FormLista({
  checklistId, momento, puntos,
}: { checklistId: string; momento: string; puntos: { id: string; orden: number; texto: string }[] }) {
  return (
    <form action={registrarLista} className="formulario">
      <input type="hidden" name="checklist_id" value={checklistId} />
      <input type="hidden" name="momento" value={momento} />
      <div className="campo">
        <label htmlFor="empleado">¿Quién hizo la lista?</label>
        <input id="empleado" name="empleado" required autoComplete="off" placeholder="Nombre y apellido" />
      </div>
      <FormPuntos puntos={puntos} requerido />
      <div className="acciones"><BotonEnviar>Guardar lista</BotonEnviar></div>
    </form>
  );
}
