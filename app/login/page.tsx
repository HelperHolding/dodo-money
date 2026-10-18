import { iniciarSesion } from "./actions";

const MENSAJES: Record<string, string> = {
  credenciales: "El correo o la contraseña no coinciden. Revísalos e intenta de nuevo.",
  "sin-perfil": "Tu usuario no tiene sucursal asignada. Pide al administrador que la agregue.",
  "sin-sucursal": "No encontramos tu sucursal. Pide al administrador que revise tu perfil.",
  inactivo: "Tu usuario está desactivado. Habla con tu gerente.",
};

/** Lo que el equipo hace aquí, en sus palabras: se lee en el panel de marca (en celular se oculta). */
const USOS = ["Arqueos, cierres y recolecciones", "Ventas de Dodo IS y Rappi", "Compras, pagos y P&L contra meta"];

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login login-dividida">
      <aside className="login-marca" aria-label="Dodo MX">
        <div className="login-marca-identidad">
          <img className="login-logo" src="/logo-dodo.png" alt="" width={56} height={56} />
          <span>Dodo MX</span>
        </div>
        <p className="login-marca-lema">La operación de cada sucursal, en un solo lugar.</p>
        <ul className="login-marca-usos">{USOS.map((u) => <li key={u}>{u}</li>)}</ul>
      </aside>
      <section className="login-panel">
        <form action={iniciarSesion}>
          <img className="login-logo login-logo-movil" src="/logo-dodo.png" alt="Dodo Pizza" width={64} height={64} />
          <div className="encabezado">
            <h1>Entrar</h1>
            <p>Usa el correo y la contraseña que te dio tu gerente.</p>
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
      </section>
    </main>
  );
}
