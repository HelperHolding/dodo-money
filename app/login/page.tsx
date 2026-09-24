import { iniciarSesion } from "./actions";

const MENSAJES: Record<string, string> = {
  credenciales: "El correo o la contraseña no coinciden. Revísalos e intenta de nuevo.",
  "sin-perfil": "Tu usuario no tiene sucursal asignada. Pide al administrador que la agregue.",
  "sin-sucursal": "No encontramos tu sucursal. Pide al administrador que revise tu perfil.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login">
      <form action={iniciarSesion}>
        <div className="encabezado">
          <h1>Control de efectivo</h1>
          <p>Entra con el usuario que te dio tu gerente.</p>
        </div>
        {error && MENSAJES[error] && <p className="aviso aviso-error" role="alert">{MENSAJES[error]}</p>}
        <div className="campo">
          <label htmlFor="correo">Correo</label>
          <input id="correo" name="correo" type="email" autoComplete="username" required />
        </div>
        <div className="campo">
          <label htmlFor="contrasena">Contraseña</label>
          <input id="contrasena" name="contrasena" type="password" autoComplete="current-password" required />
        </div>
        <button className="boton" type="submit">Entrar</button>
      </form>
    </main>
  );
}
