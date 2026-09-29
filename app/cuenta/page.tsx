import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { MIN_CARACTERES } from "@/lib/contrasena";
import { obtenerPerfil } from "@/lib/contexto";
import { cambiarContrasena } from "./actions";

export default async function PaginaCuenta({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { user, perfil } = await obtenerPerfil({ permitirCambioPendiente: true });
  return (
    <>
      <div className="encabezado">
        <h1>{perfil.debe_cambiar_contrasena ? "Cambia tu contraseña" : "Mi contraseña"}</h1>
        <p>
          {perfil.debe_cambiar_contrasena
            ? "Entraste con una contraseña temporal. Elige una nueva para empezar a usar la app; solo tú la vas a conocer."
            : `Cambia la contraseña con la que entras (${user.email}).`}
        </p>
      </div>
      <Aviso ok={ok} error={error} />
      <form action={cambiarContrasena} className="seccion formulario formulario-corto">
        <div className="campo">
          <label htmlFor="actual">{perfil.debe_cambiar_contrasena ? "Contraseña temporal" : "Contraseña actual"}</label>
          <input id="actual" name="actual" type="password" autoComplete="current-password" required />
        </div>
        <div className="campo">
          <label htmlFor="nueva">Contraseña nueva</label>
          <input id="nueva" name="nueva" type="password" autoComplete="new-password" minLength={MIN_CARACTERES} required />
          <small>Al menos {MIN_CARACTERES} caracteres. No la compartas con nadie.</small>
        </div>
        <div className="campo">
          <label htmlFor="confirmar">Escríbela otra vez</label>
          <input id="confirmar" name="confirmar" type="password" autoComplete="new-password" minLength={MIN_CARACTERES} required />
        </div>
        <BotonEnviar pendiente="Cambiando…">Cambiar contraseña</BotonEnviar>
      </form>
    </>
  );
}
