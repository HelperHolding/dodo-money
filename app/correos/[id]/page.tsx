import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BarrasVerticales } from "@/components/BarrasVerticales";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import { estadisticas, reintentables } from "@/lib/correos/estadisticas";
import { barrasPorHora, enlaceCorto, NOMBRE_ENVIO, TONO_ENVIO, TONO_ESTADO } from "@/lib/correos/presentacion";
import { NOMBRE_ESTADO } from "@/lib/correos/tipos";
import { cambiarEstado, duplicarCampana } from "../acciones";
import { esperandoN8n, leerCampana, leerEnviosYEventos } from "../datos";
import { fechaHoraMX } from "../formato";
import styles from "../correos.module.css";

const pct = (n: number) => `${Math.round(n * 1000) / 10} %`;
const personas = (n: number) => `${n.toLocaleString("es-MX")} ${n === 1 ? "persona" : "personas"}`;
function Boton({ id, accion, texto }: { id: string; accion: string; texto: string }) {
  return <form action={cambiarEstado}><input type="hidden" name="id" value={id} /><input type="hidden" name="accion" value={accion} /><button type="submit" className="boton">{texto}</button></form>;
}

/** Detalle de una campaña: estado y acciones arriba, cifras de envío y respuesta, clics por enlace, actividad por hora y destinatarios. */
export default async function Campana({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; q?: string }> }) {
  const { id } = await params, sp = await searchParams, { supabase, perfil } = await obtenerPerfil();
  const c = await leerCampana(supabase, id); if (!c) notFound();
  const [{ envios, eventos }, sinN8n] = await Promise.all([leerEnviosYEventos(supabase, id), esperandoN8n(supabase)]);
  const s = estadisticas(envios, eventos), editar = puedeEditarCorreos(perfil.rol), reintentar = reintentables(envios);
  const q = (sp.q ?? "").trim().toLowerCase(), coinciden = envios.filter((e) => !e.es_prueba && e.email.toLowerCase().includes(q)), lista = coinciden.slice(0, 500);
  const masClics = Math.max(1, ...s.porEnlace.map((e) => e.personas));
  const fechas = [c.programada_para && `Programada: ${fechaHoraMX(c.programada_para)}`, c.terminada_en && `Terminó: ${fechaHoraMX(c.terminada_en)}`].filter(Boolean).join(" · ");

  return <>
    <Aviso ok={sp.ok} error={sp.error} />
    <EncabezadoPagina titulo={c.nombre}
      descripcion={<span className={styles.resumen}><span className="estado" data-tono={TONO_ESTADO[c.estado]}>{NOMBRE_ESTADO[c.estado]}</span><span>{c.asunto}</span>{fechas && <small>{fechas}</small>}</span>}
      acciones={editar && <div className="acciones">
        {(c.estado === "borrador" || c.estado === "programada") && <Link className="boton" href={`/correos/${c.id}/editar`}>Editar</Link>}
        {c.estado === "enviando" && <Boton id={c.id} accion="detener" texto="Detener" />}
        {c.estado === "detenida" && <Boton id={c.id} accion="reanudar" texto="Reanudar" />}
        {reintentar.total > 0 && c.estado !== "cancelada" && <Boton id={c.id} accion="reintentar" texto={`Reintentar ${reintentar.total} con problema`} />}
        <form action={duplicarCampana}><input type="hidden" name="id" value={c.id} /><button type="submit" className="boton boton-secundario">Duplicar</button></form>
      </div>} />
    {reintentar.quizaSalieron > 0 && c.estado !== "cancelada" && <p className="aviso aviso-error">{reintentar.quizaSalieron} de los que tienen problema pudieron haber salido; revisa antes de reintentar.</p>}
    {sinN8n && (c.estado === "enviando" || c.estado === "programada") && <p className="aviso aviso-error">Esperando a n8n: no ha pedido correos en más de 10 minutos.</p>}

    <section className="seccion" aria-labelledby="c-numeros">
      <h2 id="c-numeros">Resultados</h2>
      <div className={styles.franjas}>
        <div><h3>Envío</h3><div className="ficha-indicadores">
          <div><small>Destinatarios</small><strong>{s.destinatarios.toLocaleString("es-MX")}</strong></div>
          <div><small>Aceptados</small><strong>{s.aceptados.toLocaleString("es-MX")}</strong></div>
          <div><small>Con problema</small><strong data-alerta={s.problema > 0 || undefined}>{s.problema.toLocaleString("es-MX")}</strong></div>
          <div><small>Pendientes</small><strong>{s.pendientes.toLocaleString("es-MX")}</strong></div>
        </div></div>
        <div><h3>Respuesta</h3><div className={`ficha-indicadores ${styles.tres}`}>
          <div><small>Aperturas</small><strong>{pct(s.pctApertura)}</strong><small>{personas(s.abrieron)}</small></div>
          <div><small>Clics</small><strong>{pct(s.pctClic)}</strong><small>{personas(s.clics)}</small></div>
          <div><small>Bajas</small><strong>{s.bajas.toLocaleString("es-MX")}</strong></div>
        </div></div>
      </div>
      <p className="saldo-nota">Las aperturas son orientativas: Apple Mail las adelanta y quien bloquea imágenes no cuenta. Los clics de antivirus (primeros 10 s) no se cuentan.</p>
    </section>

    {(s.porEnlace.length > 0 || s.porHora.length > 0) && <div className={styles.columnas}>
      {s.porEnlace.length > 0 && <section className="seccion" aria-labelledby="c-enlaces"><h2 id="c-enlaces">Clics por enlace</h2>
        <div className="tabla-contenedor"><table className="tabla tabla-tarjetas">
          <thead><tr><th>Enlace</th><th className="monto">Personas</th></tr></thead>
          <tbody>{s.porEnlace.map((e) => <tr key={e.enlace}>
            <td data-label="Enlace"><a href={e.enlace} target="_blank" rel="noreferrer" className={styles.enlace} title={e.enlace}>{enlaceCorto(e.enlace)}</a>
              <span className={styles.barra} aria-hidden="true"><span style={{ width: `${(e.personas / masClics) * 100}%` }} /></span></td>
            <td data-label="Personas" className="monto">{e.personas.toLocaleString("es-MX")}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}
      {s.porHora.length > 0 && <section className="seccion" aria-labelledby="c-horas"><h2 id="c-horas">Actividad por hora</h2>
        <BarrasVerticales titulo="Aperturas y clics por hora" dias={barrasPorHora(s.porHora)} />
        <p className="saldo-nota">Hora de México. Cada barra suma aperturas y clics de esa hora.</p>
      </section>}
    </div>}

    <section className="seccion" aria-labelledby="c-destinatarios">
      <h2 id="c-destinatarios">Destinatarios</h2>
      <div className={styles.herramientas}>
        <form className={styles.buscar}><input name="q" type="search" defaultValue={sp.q} placeholder="Buscar correo" aria-label="Buscar correo" /><button className="boton boton-secundario" type="submit">Buscar</button></form>
        <a className="boton boton-secundario" href={`/correos/${c.id}/csv`}>Descargar CSV</a>
      </div>
      {coinciden.length > 500 && <p className="saldo-nota">Mostrando 500 de {coinciden.length.toLocaleString("es-MX")}. Usa la búsqueda o descarga el CSV.</p>}
      {!lista.length ? <p className="vacio">{q ? "Ningún correo coincide con la búsqueda." : "Sin destinatarios todavía."}</p>
        : <div className="tabla-contenedor"><table className="tabla tabla-tarjetas">
          <thead><tr><th>Correo</th><th>Estado</th><th>Abrió</th><th>Clic</th></tr></thead>
          <tbody>{lista.map((e) => { const r = s.porEnvio[e.id]; return <tr key={e.id}>
            <td data-label="Correo"><strong>{e.email}</strong>{e.estado === "problema" && e.detalle && <small className={styles.detalle}>{e.detalle}</small>}</td>
            <td data-label="Estado"><span className="estado" data-tono={TONO_ENVIO[e.estado]}>{NOMBRE_ENVIO[e.estado]}</span></td>
            <td data-label="Abrió">{r?.abrio ? fechaHoraMX(r.abrio) : "—"}</td>
            <td data-label="Clic">{r?.clic ? fechaHoraMX(r.clic) : "—"}</td>
          </tr>; })}</tbody>
        </table></div>}
    </section>

    <section className="seccion" aria-labelledby="c-correo"><h2 id="c-correo">Correo enviado</h2>
      <iframe title="Correo enviado" sandbox="" srcDoc={c.html} className={styles.previa} />
    </section>
  </>;
}
