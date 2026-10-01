import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaMX, fechaTexto, hora, hoyCalendarioMX, pesos } from "@/lib/formato";
import { puedeRecibirEfectivo } from "@/lib/roles";
import { CLASE_ESTADO_SALIDA, estadoSalida, NOMBRE_ESTADO_SALIDA, resumenEnCamino, type Recepcion } from "@/lib/salidas";
import type { EstadoMovimiento } from "@/lib/tipos";
import { aceptarEntrada, noCuadra, rechazarSalida, recogerSalida } from "./actions";

type Salida = {
  id: string; sucursal_id: string; monto: number; folio: string | null; nota: string | null; estado: EstadoMovimiento;
  registrado_por: string; creado_en: string; confirmado_por: string | null; confirmado_en: string | null;
  recepcion: Recepcion | null; recibido_por: string | null; recibido_en: string | null; nota_recepcion: string | null;
};
const COLUMNAS = "id, sucursal_id, monto, folio, nota, estado, registrado_por, creado_en, confirmado_por, confirmado_en, recepcion, recibido_por, recibido_en, nota_recepcion";

const cuando = (iso: string) => `${fechaTexto(fechaMX(iso))}, ${hora(iso)}`;

export default async function Efectivo({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const desde = new Date(`${hoyCalendarioMX()}T00:00:00-06:00`);
  desde.setUTCDate(desde.getUTCDate() - 30);
  const hace30 = desde.toISOString();

  const [{ data: abiertas }, { data: recientes }, { data: sucursales }, { data: nombres }] = await Promise.all([
    supabase.from("movimientos").select(COLUMNAS).eq("tipo", "salida_corporativo")
      .or("estado.eq.pendiente,and(estado.eq.confirmado,recepcion.is.null)")
      .order("creado_en").returns<Salida[]>(),
    supabase.from("movimientos").select(COLUMNAS).eq("tipo", "salida_corporativo")
      .or(`recibido_en.gte."${hace30}",and(estado.eq.rechazado,confirmado_en.gte."${hace30}")`)
      .order("creado_en", { ascending: false }).returns<Salida[]>(),
    supabase.from("sucursales").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  const sucursal = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const porRecoger = (abiertas ?? []).filter((s) => s.estado === "pendiente");
  const enCamino = (abiertas ?? []).filter((s) => s.estado === "confirmado");
  const resumen = resumenEnCamino([...(abiertas ?? []), ...(recientes ?? [])]);
  const esAdmin = perfil.rol === "admin";
  const recibe = puedeRecibirEfectivo(perfil.rol);

  const tarjeta = (s: Salida, acciones?: React.ReactNode) => {
    const e = estadoSalida(s);
    return (
      <article key={s.id} className="tarjeta" data-alerta={e === "no_cuadro" ? "si" : undefined}>
        <div className="tarjeta-encabezado">
          <div>
            <h3>{sucursal.get(s.sucursal_id) ?? "Sucursal"} · {pesos(s.monto)}</h3>
            <p className="tarjeta-estado"><span className={`estado estado-${CLASE_ESTADO_SALIDA[e]}`}>{NOMBRE_ESTADO_SALIDA[e]}</span></p>
          </div>
        </div>
        <dl className="tarjeta-datos">
          <dt>Folio</dt><dd>{s.folio ?? "—"}</dd>
          <dt>Registró</dt><dd>{persona.get(s.registrado_por) ?? "—"} · {cuando(s.creado_en)}</dd>
          {s.confirmado_por && s.confirmado_en && (
            <><dt>{s.estado === "rechazado" ? "Rechazó" : "Recogió"}</dt><dd>{persona.get(s.confirmado_por) ?? "—"} · {cuando(s.confirmado_en)}</dd></>
          )}
          {s.recibido_en && (
            <><dt>{s.recepcion === "rechazada" ? "Revisó" : "Recibió"}</dt><dd>{(s.recibido_por && persona.get(s.recibido_por)) ?? "—"} · {cuando(s.recibido_en)}</dd></>
          )}
          {s.nota_recepcion && <><dt>{s.recepcion === "rechazada" ? "Motivo" : "Nota"}</dt><dd>{s.nota_recepcion}</dd></>}
          {s.nota && <><dt>Nota de sucursal</dt><dd>{s.nota}</dd></>}
        </dl>
        {acciones}
      </article>
    );
  };

  return (
    <>
      <div className="encabezado">
        <h1>Salidas a corporativo</h1>
        <p>La sucursal registra la salida, un admin la recoge y corporativo cuenta el efectivo y confirma que llegó.</p>
      </div>
      <Aviso ok={ok} error={error} />

      <div className="rejilla">
        <div className="saldo" style={resumen.cuantas ? { borderLeftColor: "var(--alerta)" } : undefined}>
          <span>En camino ({resumen.cuantas})</span><span className="saldo-monto">{pesos(resumen.total)}</span>
        </div>
        <div className="saldo"><span>Por recoger</span><span className="saldo-monto">{resumen.porRecoger}</span></div>
        <div className="saldo" style={resumen.noCuadro ? { borderLeftColor: "var(--alerta)" } : undefined}>
          <span>No cuadró (30 días)</span><span className="saldo-monto">{resumen.noCuadro}</span>
        </div>
      </div>

      <section className="seccion" aria-labelledby="t-camino">
        <h2 id="t-camino">En camino</h2>
        {!enCamino.length ? <p className="vacio">No hay efectivo en camino.</p> : (
          <div className="tarjetas">
            {enCamino.map((s) => tarjeta(s, recibe && (
              <div className="acciones-salida">
                <form action={aceptarEntrada}>
                  <input type="hidden" name="id" value={s.id} />
                  <BotonEnviar pendiente="Guardando…" confirmar={`¿Contaste ${pesos(s.monto)} y está completo?`}>Recibido completo</BotonEnviar>
                </form>
                <form action={noCuadra} className="form-motivo">
                  <input type="hidden" name="id" value={s.id} />
                  <label className="solo-lector" htmlFor={`nota-${s.id}`}>Por qué no cuadra</label>
                  <input id={`nota-${s.id}`} name="nota" placeholder="Por qué no cuadra (p. ej. faltan $200)" required />
                  <BotonEnviar className="boton boton-alerta" pendiente="Guardando…">No cuadra</BotonEnviar>
                </form>
              </div>
            )))}
          </div>
        )}
      </section>

      <section className="seccion" aria-labelledby="t-recoger">
        <h2 id="t-recoger">Por recoger</h2>
        {!porRecoger.length ? <p className="vacio">Ninguna sucursal tiene salidas esperando al admin.</p> : (
          <div className="tarjetas">
            {porRecoger.map((s) => tarjeta(s, esAdmin && (
              s.registrado_por === perfil.id ? <p className="vacio">La registraste tú: la recoge otro admin.</p> : (
                <div className="acciones">
                  <form action={recogerSalida}>
                    <input type="hidden" name="id" value={s.id} />
                    <BotonEnviar pendiente="Guardando…" confirmar={`¿Recibiste ${pesos(s.monto)} de ${sucursal.get(s.sucursal_id) ?? "la sucursal"}? Quedará a tu cargo hasta que corporativo lo reciba.`}>Recogí el efectivo</BotonEnviar>
                  </form>
                  <form action={rechazarSalida}>
                    <input type="hidden" name="id" value={s.id} />
                    <BotonEnviar className="boton boton-alerta" pendiente="…" confirmar="¿Rechazar esta salida? La sucursal tendría que registrarla de nuevo.">Rechazar</BotonEnviar>
                  </form>
                </div>
              )
            )))}
          </div>
        )}
      </section>

      <section className="seccion" aria-labelledby="t-recientes">
        <h2 id="t-recientes">Últimos 30 días</h2>
        {!recientes?.length ? <p className="vacio">Todavía no hay salidas recibidas en los últimos 30 días.</p> : (
          <div className="tarjetas">{recientes.map((s) => tarjeta(s))}</div>
        )}
      </section>
    </>
  );
}
