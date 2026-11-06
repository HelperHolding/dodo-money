import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
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
  return <>
    {sp.error && <p className={styles.alerta}>{sp.error}</p>}{sp.ok && <p>{sp.ok}</p>}
    {error && <p className={styles.alerta}>No se pudo leer la lista de contactos.</p>}
    <header className={styles.cabecera}><h1>Contactos</h1><span>{activos ?? 0} activos</span></header>
    <Importar key={sp.huella ?? ""} previa={sp.previa ?? null} huella={sp.huella ?? ""} origen={sp.origen ?? ""} etiquetaExtra={sp.etiquetaExtra ?? ""} />
    <form className={styles.fila} action={guardarContacto}>
      <h2>Agregar contacto</h2>
      <label>Correo<input name="email" type="email" required /></label><label>Nombre<input name="nombre" maxLength={160} /></label>
      <label>Etiquetas (separadas por coma)<input name="etiquetas" /></label><button className="boton" type="submit">Guardar</button>
    </form>
    <form className={styles.fila}><input name="q" defaultValue={sp.q} placeholder="Buscar correo o nombre" />
      <select name="estado" defaultValue={sp.estado ?? ""}><option value="">Todos</option><option value="activo">Activos</option><option value="baja">Dados de baja</option><option value="rebote">Con rebote</option></select>
      {sp.etiqueta && <input type="hidden" name="etiqueta" value={sp.etiqueta} />}
      <button className="boton" type="submit">Filtrar</button></form>
    <p><small>{total} contactos{buscar || sp.estado || sp.etiqueta ? " con este filtro" : ""} · página {pagina} de {paginas}</small></p>
    <div className={styles.tarjetas}>{contactos.map((c) => <div key={c.id} className={styles.tarjeta}>
      <strong>{c.email}</strong>{c.nombre && <span>{c.nombre}</span>}
      <small>{c.estado}{c.etiquetas.length ? ` · ${c.etiquetas.join(", ")}` : ""}{c.origen ? ` · ${c.origen}` : ""}</small>
      <details><summary>Editar</summary>
        <form className={styles.fila} action={guardarContacto}><input type="hidden" name="id" value={c.id} />
          <label>Correo<input name="email" type="email" defaultValue={c.email} required /></label>
          <label>Nombre<input name="nombre" maxLength={160} defaultValue={c.nombre ?? ""} /></label>
          <label>Etiquetas<input name="etiquetas" defaultValue={c.etiquetas.join(", ")} /></label>
          <button className="boton" type="submit">Guardar cambios</button></form>
      </details>
      {c.estado === "activo" && <form action={bajaManual}><input type="hidden" name="id" value={c.id} /><button type="submit">Dar de baja</button></form>}
    </div>)}</div>
    {paginas > 1 && <nav className={styles.cabecera}>
      {pagina > 1 ? <Link href={enlace(pagina - 1)}>← Anterior</Link> : <span />}
      {pagina < paginas ? <Link href={enlace(pagina + 1)}>Siguiente →</Link> : <span />}
    </nav>}
  </>;
}
