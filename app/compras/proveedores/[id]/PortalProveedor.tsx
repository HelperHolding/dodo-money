"use client";

import { useEffect, useRef, useState } from "react";
import type { PortalProveedor as DatosPortal } from "@/lib/compras/portal";
import { guardarPortal, revelarPortal } from "./portal-acciones";

export function PortalProveedor({ id, portal, disponible }: { id: string; portal: DatosPortal | null; disponible: boolean }) {
  const [password, setPassword] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [guardado, setGuardado] = useState(portal);
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (password === null) return;
    const temporizador = setTimeout(() => setPassword(null), 60_000);
    const ocultar = () => { if (document.hidden) setPassword(null); };
    document.addEventListener("visibilitychange", ocultar);
    return () => { clearTimeout(temporizador); document.removeEventListener("visibilitychange", ocultar); };
  }, [password]);
  return <section className="seccion">
    <h2>Accesos de portal</h2>
    <p>Solo administración. La contraseña se guarda cifrada.</p>
    {!disponible ? <p className="aviso aviso-error">Accesos no disponibles. Aplica la migración 0036 en Supabase.</p> : <>
      {guardado && <dl className="tarjeta-datos">
        <dt>Portal</dt><dd><a href={guardado.url} target="_blank" rel="noopener noreferrer">Abrir portal ↗</a></dd>
        <dt>Usuario</dt><dd>{guardado.usuario}</dd>
        <dt>Contraseña</dt><dd>
          {guardado.tiene_password ? <>
            <span style={{ overflowWrap: "anywhere" }}>{password ?? "••••••••"}</span>{" "}
            <button type="button" disabled={ocupado} onClick={async () => {
              if (password !== null) { setPassword(null); return; }
              setOcupado(true); setMensaje("");
              try { const r = await revelarPortal(id); if (typeof r.password === "string") { if (!document.hidden) setPassword(r.password); } else setMensaje(r.error ?? "No se pudo consultar la contraseña."); }
              catch { setMensaje("No se pudo consultar la contraseña."); }
              finally { setOcupado(false); }
            }}>{password === null ? "Mostrar contraseña" : "Ocultar contraseña"}</button>
            {password !== null && <small> Se oculta automáticamente en un minuto.</small>}
          </> : "Sin contraseña guardada"}
        </dd>
        {guardado.notas && <><dt>Notas de acceso</dt><dd style={{ whiteSpace: "pre-wrap" }}>{guardado.notas}</dd></>}
      </dl>}
      <details open={!guardado}><summary>{guardado ? "Editar acceso" : "Agregar acceso"}</summary>
        <form ref={formulario} className="formulario" onSubmit={async e => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setOcupado(true); setPassword(null); setMensaje("");
          try {
            const r = await guardarPortal(id, fd);
            if ("error" in r) setMensaje(r.error ?? "No se pudo guardar.");
            else {
              setMensaje(r.ok);
              setGuardado({ url: String(fd.get("url")).trim(), usuario: String(fd.get("usuario")).trim(), notas: String(fd.get("notas")).trim() || null,
                tiene_password: fd.get("quitar_password") === "on" ? false : Boolean(fd.get("password")) || Boolean(guardado?.tiene_password) });
              const entrada = formulario.current?.elements.namedItem("password");
              if (entrada instanceof HTMLInputElement) entrada.value = "";
              const quitar = formulario.current?.elements.namedItem("quitar_password");
              if (quitar instanceof HTMLInputElement) quitar.checked = false;
            }
          } catch { setMensaje("No se pudo guardar el acceso."); }
          finally { setOcupado(false); }
        }}>
          <div className="campo"><label htmlFor="portal_url">Enlace del portal</label><input id="portal_url" name="url" type="url" required maxLength={2000} placeholder="https://" defaultValue={portal?.url ?? ""} /></div>
          <div className="campo"><label htmlFor="portal_usuario">Usuario o correo de acceso</label><input id="portal_usuario" name="usuario" required maxLength={200} autoComplete="off" defaultValue={portal?.usuario ?? ""} /></div>
          <div className="campo"><label htmlFor="portal_password">{guardado?.tiene_password ? "Nueva contraseña" : "Contraseña"}</label><input id="portal_password" name="password" type="password" maxLength={1000} autoComplete="new-password" /><small>Déjala vacía para conservar la actual.</small></div>
          {guardado?.tiene_password && <label><input type="checkbox" name="quitar_password" /> Quitar la contraseña guardada</label>}
          <div className="campo"><label htmlFor="portal_notas">Notas de acceso</label><textarea id="portal_notas" name="notas" rows={3} maxLength={2000} defaultValue={portal?.notas ?? ""} placeholder="Ej. quién recibe el código de verificación" /></div>
          <div className="acciones"><button type="submit" className="boton" disabled={ocupado}>{ocupado ? "Procesando…" : "Guardar acceso"}</button></div>
        </form>
      </details>
      <p role="status">{mensaje}</p>
    </>}
  </section>;
}
