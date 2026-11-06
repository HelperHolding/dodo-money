import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import { estadisticas } from "@/lib/correos/estadisticas";
import { NOMBRE_ESTADO } from "@/lib/correos/tipos";
import { cambiarEstado } from "../acciones";
import { esperandoN8n, leerCampana, leerEnviosYEventos } from "../datos";
import { fechaHoraMX } from "../formato";
import styles from "../correos.module.css";

const pct = (n: number) => `${Math.round(n * 1000) / 10} %`;
function Boton({ id, accion, texto }: { id: string; accion: string; texto: string }) {
  return <form action={cambiarEstado}><input type="hidden" name="id" value={id} /><input type="hidden" name="accion" value={accion} /><button type="submit" className="boton">{texto}</button></form>;
}

export default async function Campana({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; q?: string }> }) {
  const { id } = await params, sp = await searchParams, { supabase, perfil } = await obtenerPerfil();
  const c = await leerCampana(supabase, id); if (!c) notFound();
  const [{ envios, eventos }, sinN8n] = await Promise.all([leerEnviosYEventos(supabase, id), esperandoN8n(supabase)]);
  const s = estadisticas(envios, eventos), editar = puedeEditarCorreos(perfil.rol);
  const q = (sp.q ?? "").trim().toLowerCase(), lista = envios.filter((e) => !e.es_prueba && e.email.toLowerCase().includes(q)).slice(0, 500);
  return <>
    {sp.error && <p className={styles.alerta}>{sp.error}</p>}{sp.ok && <p>{sp.ok}</p>}
    <header className={styles.cabecera}><div><span className={styles[c.estado]}>{NOMBRE_ESTADO[c.estado]}</span><h1>{c.nombre}</h1><p>{c.asunto}</p>
      <small>{c.programada_para && `Programada: ${fechaHoraMX(c.programada_para)}`}{c.terminada_en && ` · Terminó: ${fechaHoraMX(c.terminada_en)}`}</small></div>
      {editar && <div className={styles.fila}>
        {(c.estado === "borrador" || c.estado === "programada") && <Link className="boton" href={`/correos/${c.id}/editar`}>Editar</Link>}
        {c.estado === "enviando" && <Boton id={c.id} accion="detener" texto="Detener" />}
        {c.estado === "detenida" && <Boton id={c.id} accion="reanudar" texto="Reanudar" />}
        {s.problema > 0 && c.estado !== "cancelada" && <Boton id={c.id} accion="reintentar" texto={`Reintentar ${s.problema} con problema`} />}
      </div>}
    </header>
    {sinN8n && (c.estado === "enviando" || c.estado === "programada") && <p className={styles.alerta}>Esperando a n8n: no ha pedido correos en más de 10 minutos.</p>}
    <section className={styles.numeros}>
      <div><strong>{s.destinatarios}</strong>destinatarios</div><div><strong>{s.aceptados}</strong>aceptados</div>
      <div><strong>{s.problema}</strong>con problema</div><div><strong>{s.pendientes}</strong>pendientes</div>
      <div><strong>{pct(s.pctApertura)}</strong>{s.abrieron} abrieron</div><div><strong>{pct(s.pctClic)}</strong>{s.clics} dieron clic</div>
      <div><strong>{s.bajas}</strong>bajas</div>
    </section>
    <p><small>Las aperturas son orientativas: Apple Mail las adelanta y quien bloquea imágenes no cuenta. Los clics de antivirus (primeros 10 s) no se cuentan.</small></p>
    {s.porEnlace.length > 0 && <section><h2>Clics por enlace</h2><ul>{s.porEnlace.map((e) => <li key={e.enlace}>{e.enlace}: {e.personas}</li>)}</ul></section>}
    {s.porHora.length > 0 && <section><h2>Actividad por hora</h2><ul>{s.porHora.map((h) => <li key={h.hora}>{h.hora}: {h.aperturas} aperturas · {h.clics} clics</li>)}</ul></section>}
    <section><header className={styles.cabecera}><h2>Destinatarios</h2><a className="boton" href={`/correos/${c.id}/csv`}>Descargar CSV</a></header>
      <form><input name="q" defaultValue={sp.q} placeholder="Buscar correo" /></form>
      <div className={styles.tarjetas}>{lista.map((e) => <div key={e.id} className={styles.tarjeta}>
        <strong>{e.email}</strong><span>{e.estado}</span>
        <small>{s.porEnvio[e.id]?.abrio ? `Abrió ${fechaHoraMX(s.porEnvio[e.id].abrio!)}` : "Sin apertura"}{s.porEnvio[e.id]?.clic && ` · Clic ${fechaHoraMX(s.porEnvio[e.id].clic!)}`}</small>
        {e.estado === "problema" && <small className={styles.alerta}>{e.detalle}</small>}
      </div>)}</div>
    </section>
    <section><h2>Correo enviado</h2><iframe title="Correo" sandbox="" srcDoc={c.html} className={styles.previa} /></section>
  </>;
}
