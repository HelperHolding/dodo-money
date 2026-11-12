import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { Plegable } from "@/components/Plegable";
import styles from "../correos.module.css";
import { bajaManual, guardarContacto } from "./acciones";
import { Importar } from "./Importar";

type Contacto = { id: string; email: string; nombre: string | null; etiquetas: string[]; estado: string; origen: string | null };
type Params = { q?: string; etiqueta?: string; estado?: string; pagina?: string; ok?: string; error?: string; previa?: string; origen?: string; etiquetaExtra?: string; huella?: string };
const POR_PAGINA = 50;

export default async function Contactos({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCorreos(perfil.rol)) redirect("/correos");
  const sp = await searchParams;
  const pedida = Math.max(1, Math.floor(Number(sp.pagina)) || 1);
  const buscar = (sp.q ?? "").replace(/[%,()*\\"]/g, "").trim();
  const base = (opciones: { count: "exact"; head?: boolean }, columnas: string) => {
    let c = supabase.from("correo_contactos").select(columnas, opciones);
    if (buscar) c = c.or(`email.ilike.%${buscar}%,nombre.ilike.%${buscar}%`);
    if (sp.estado) c = c.eq("estado", sp.estado);
    if (sp.etiqueta) c = c.contains("etiquetas", [sp.etiqueta]);
    return c;
  };
  const { count: totalFiltrado } = await base({ count: "exact", head: true }, "id");
  // Una página fuera de rango (PostgREST 416) se lleva a la última.
  const pagina = Math.min(pedida, Math.max(1, Math.ceil((totalFiltrado ?? 0) / POR_PAGINA))), desde = (pagina - 1) * POR_PAGINA;
  const q = base({ count: "exact" }, "id,email,nombre,etiquetas,estado,origen").order("email").range(desde, desde + POR_PAGINA - 1);
  const [{ data, count, error }, { count: activos }] = await Promise.all([q, supabase.from("correo_contactos").select("id", { count: "exact", head: true }).eq("estado", "activo")]);
  const contactos = (data ?? []) as unknown as Contacto[], total = count ?? 0, paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const enlace = (n: number) => { const u = new URLSearchParams(); if (buscar) u.set("q", buscar); if (sp.estado) u.set("estado", sp.estado); if (sp.etiqueta) u.set("etiqueta", sp.etiqueta); u.set("pagina", String(n)); return `/correos/contactos?${u}`; };
  const NOMBRE_ESTADO_CONTACTO: Record<string, string> = { activo: "Activo", baja: "Dado de baja", rebote: "Con rebote" };
  const TONO_CONTACTO: Record<string, string> = { activo: "ok", baja: "neutro", rebote: "alerta" };
  return <>
    <Aviso ok={sp.ok} error={sp.error} />
    {error && <p className="aviso aviso-error">No se pudo leer la lista de contactos.</p>}
    <EncabezadoPagina titulo="Contactos" descripcion={`${(activos ?? 0).toLocaleString("es-MX")} activos para recibir campañas`} />
    <div className={styles.columnas}>
      <Plegable id="c-agregar" titulo="Agregar contacto" resumen="Uno por uno">
        <form className={styles.panel} action={guardarContacto}>
          <label>Correo<input name="email" type="email" required /></label><label>Nombre<input name="nombre" maxLength={160} /></label>
          <label>Etiquetas (separadas por coma)<input name="etiquetas" /></label><button className="boton" type="submit">Guardar</button>
        </form>
      </Plegable>
      <Plegable id="c-importar" titulo="Importar CSV" resumen="Muchos a la vez" forzarAbierto={!!sp.previa}>
        <Importar key={sp.huella ?? ""} previa={sp.previa ?? null} huella={sp.huella ?? ""} origen={sp.origen ?? ""} etiquetaExtra={sp.etiquetaExtra ?? ""} />
      </Plegable>
    </div>
    <section className="seccion" aria-labelledby="c-lista">
      <h2 id="c-lista">Lista</h2>
      <form className={styles.herramientas}>
        <input name="q" type="search" defaultValue={sp.q} placeholder="Buscar correo o nombre" aria-label="Buscar correo o nombre" />
        <select name="estado" defaultValue={sp.estado ?? ""} aria-label="Estado"><option value="">Todos</option><option value="activo">Activos</option><option value="baja">Dados de baja</option><option value="rebote">Con rebote</option></select>
        {sp.etiqueta && <input type="hidden" name="etiqueta" value={sp.etiqueta} />}
        <button className="boton boton-secundario" type="submit">Filtrar</button>
      </form>
      <p className="saldo-nota">{total.toLocaleString("es-MX")} contactos{buscar || sp.estado || sp.etiqueta ? " con este filtro" : ""} · página {pagina} de {paginas}</p>
      {!contactos.length ? <p className="vacio">No hay contactos con este filtro.</p>
        : <div className="tabla-contenedor"><table className="tabla tabla-tarjetas">
          <thead><tr><th>Correo</th><th>Estado</th><th>Etiquetas</th><th>Origen</th><th><span className="solo-lector">Acciones</span></th></tr></thead>
          <tbody>{contactos.map((c) => <tr key={c.id}>
            <td data-label="Correo"><strong>{c.email}</strong>{c.nombre && <small className={styles.detalle}>{c.nombre}</small>}</td>
            <td data-label="Estado"><span className="estado" data-tono={TONO_CONTACTO[c.estado] ?? "neutro"}>{NOMBRE_ESTADO_CONTACTO[c.estado] ?? c.estado}</span></td>
            <td data-label="Etiquetas">{c.etiquetas.length ? c.etiquetas.join(", ") : "—"}</td>
            <td data-label="Origen">{c.origen ?? "—"}</td>
            <td data-label="Acciones"><div className={styles.acciones}>
              <details className={styles.editar}><summary>Editar</summary>
                <form className={styles.panel} action={guardarContacto}><input type="hidden" name="id" value={c.id} />
                  <label>Correo<input name="email" type="email" defaultValue={c.email} required /></label>
                  <label>Nombre<input name="nombre" maxLength={160} defaultValue={c.nombre ?? ""} /></label>
                  <label>Etiquetas<input name="etiquetas" defaultValue={c.etiquetas.join(", ")} /></label>
                  <button className="boton" type="submit">Guardar cambios</button></form>
              </details>
              {c.estado === "activo" && <form action={bajaManual}><input type="hidden" name="id" value={c.id} /><button className="boton boton-secundario" type="submit">Dar de baja</button></form>}
            </div></td>
          </tr>)}</tbody>
        </table></div>}
      {paginas > 1 && <nav className={styles.paginas} aria-label="Páginas">
        {pagina > 1 ? <Link className="boton boton-secundario" href={enlace(pagina - 1)}>← Anterior</Link> : <span />}
        {pagina < paginas ? <Link className="boton boton-secundario" href={enlace(pagina + 1)}>Siguiente →</Link> : <span />}
      </nav>}
    </section>
  </>;
}
