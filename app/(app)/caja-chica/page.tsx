import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto, puedeGestionar } from "@/lib/contexto";
import { fechaTexto, hoyMX, pesos } from "@/lib/formato";
import { BUCKET_FOTOS } from "@/lib/fotos";
import { NOMBRE_ORIGEN, porReponerAEmpleados, sumaPorOrigen, type OrigenGasto } from "@/lib/gastos";
import { CampoFoto } from "./CampoFoto";
import { CampoOrigen } from "./CampoOrigen";
import { marcarRepuesto, registrarGasto, solicitarReposicion } from "./actions";

type Gasto = {
  id: string; fecha: string; concepto: string; proveedor: string | null; monto: number; comprobante: string; creado_en: string; foto_path: string | null;
  origen: OrigenGasto; pagado_por: string | null; repuesto_en: string | null;
};
const COLUMNAS = "id, fecha, concepto, proveedor, monto, comprobante, creado_en, foto_path, origen, pagado_por, repuesto_en";
const COMPROBANTE: Record<string, string> = { cfdi: "Factura", nota: "Nota", sin_comprobante: "Sin comprobante" };

export default async function CajaChica({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, soloLectura } = await obtenerContexto();

  const [{ data: ultima }, { data: saldo }, { data: personas }, { data: deEmpleados }] = await Promise.all([
    supabase.from("movimientos").select("creado_en").eq("sucursal_id", sucursal.id)
      .eq("tipo", "reposicion_caja_chica").neq("estado", "rechazado")
      .order("creado_en", { ascending: false }).limit(1).maybeSingle<{ creado_en: string }>(),
    supabase.from("saldos_cajas").select("saldo").eq("sucursal_id", sucursal.id).eq("tipo", "caja_chica")
      .maybeSingle<{ saldo: number }>(),
    supabase.from("perfiles").select("id, nombre").eq("sucursal_id", sucursal.id).eq("activo", true).order("nombre")
      .returns<{ id: string; nombre: string }[]>(),
    supabase.from("gastos_caja_chica").select(COLUMNAS).eq("sucursal_id", sucursal.id)
      .eq("origen", "empleado").is("repuesto_en", null).order("fecha").returns<Gasto[]>(),
  ]);
  const nombre = new Map((personas ?? []).map((p) => [p.id, p.nombre]));

  let consulta = supabase.from("gastos_caja_chica").select(COLUMNAS)
    .eq("sucursal_id", sucursal.id).order("creado_en", { ascending: false });
  if (ultima) consulta = consulta.gt("creado_en", ultima.creado_en);
  const { data: gastos } = await consulta.returns<Gasto[]>();

  // Enlaces temporales (1 hora): las fotos están en un bucket privado.
  const rutas = (gastos ?? []).flatMap((g) => (g.foto_path ? [g.foto_path] : []));
  const { data: firmadas } = rutas.length
    ? await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(rutas, 3600)
    : { data: [] };
  const urlFoto = new Map((firmadas ?? []).flatMap((f) => (f.path && f.signedUrl ? [[f.path, f.signedUrl] as const] : [])));

  // Solo lo que salió de la caja chica se repone desde corporativo; lo de bóveda no se repone y lo de empleados va aparte.
  const porReponer = sumaPorOrigen(gastos ?? []).caja_chica;
  const empleados = porReponerAEmpleados(deEmpleados ?? []);
  const marca = puedeGestionar(perfil.rol) && !soloLectura;
  const fondo = Number(sucursal.fondo_caja_chica);
  const enCaja = Number(saldo?.saldo ?? 0);
  const sinComprobante = (gastos ?? []).filter((g) => g.comprobante === "sin_comprobante").length;

  return (
    <>
      <div className="encabezado">
        <h1>Caja chica</h1>
        <p>Solo para gastos menores, separada de la bóveda. Cada gasto se registra con su comprobante y se repone por el mismo monto.</p>
      </div>
      <Aviso ok={ok} error={error} />

      <section className="seccion" aria-labelledby="t-estado">
        <h2 id="t-estado">Estado del fondo</h2>
        <div className="rejilla">
          <div className="saldo"><span>Fondo autorizado</span><span className="saldo-monto">{pesos(fondo)}</span></div>
          <div className="saldo"><span>Gastos de caja chica por reponer</span><span className="saldo-monto">{pesos(porReponer)}</span>
            {sinComprobante > 0 && <span className="saldo-nota">{sinComprobante} sin comprobante</span>}</div>
          <div className="saldo"><span>Debe haber en caja</span><span className="saldo-monto">{pesos(enCaja)}</span>
            <span className="saldo-nota">Fondo menos gastos, más reposiciones confirmadas</span></div>
        </div>
        {porReponer > 0 && !soloLectura && (
          <form action={solicitarReposicion} className="acciones">
            <input type="hidden" name="monto" value={porReponer} />
            <BotonEnviar className="boton boton-secundario" pendiente="Solicitando…">Solicitar reposición de {pesos(porReponer)}</BotonEnviar>
          </form>
        )}
      </section>

      {!soloLectura && (
      <form action={registrarGasto} className="seccion" aria-labelledby="t-gasto">
        <h2 id="t-gasto">Registrar gasto</h2>
        <div className="rejilla">
          <div className="campo"><label htmlFor="fecha">Fecha</label><input id="fecha" name="fecha" type="date" defaultValue={hoyMX()} required /></div>
          <div className="campo"><label htmlFor="concepto">Concepto</label><input id="concepto" name="concepto" required placeholder="Ej. garrafón de agua" /></div>
          <div className="campo"><label htmlFor="proveedor">Proveedor</label><input id="proveedor" name="proveedor" /></div>
          <CampoOrigen personas={personas ?? []} yo={perfil.id} />
          <div className="campo"><label htmlFor="monto">Monto</label><input id="monto" name="monto" type="number" inputMode="decimal" min="0.5" step="0.01" required /></div>
          <div className="campo">
            <label htmlFor="comprobante">Comprobante</label>
            <select id="comprobante" name="comprobante" defaultValue="cfdi">
              <option value="cfdi">Factura (CFDI)</option>
              <option value="nota">Nota o ticket</option>
              <option value="sin_comprobante">Sin comprobante</option>
            </select>
          </div>
          <div className="campo"><label htmlFor="uuid_cfdi">Folio fiscal (UUID)</label><input id="uuid_cfdi" name="uuid_cfdi" placeholder="Solo si hay factura" /></div>
          <CampoFoto />
        </div>
        <div className="acciones"><BotonEnviar>Registrar gasto</BotonEnviar></div>
      </form>
      )}

      <section className="seccion" aria-labelledby="t-empleados">
        <h2 id="t-empleados">Por reponer a empleados</h2>
        {!empleados.length ? <p className="vacio">No hay gastos pagados por empleados pendientes de reponer.</p> : (
          <div className="tarjetas">
            {empleados.map((e) => (
              <article key={e.persona} className="tarjeta" data-alerta="si">
                <div className="tarjeta-encabezado">
                  <div>
                    <h3>{nombre.get(e.persona) ?? "Empleado"} · {pesos(e.total)}</h3>
                    <p className="tarjeta-estado">{e.gastos.length} {e.gastos.length === 1 ? "gasto" : "gastos"} por reponer</p>
                  </div>
                </div>
                <ul className="lista-repuestos">
                  {e.gastos.map((g) => (
                    <li key={g.id}>
                      <span>{fechaTexto(g.fecha)} · {g.concepto} · <strong>{pesos(g.monto)}</strong></span>
                      {marca && (
                        <form action={marcarRepuesto}>
                          <input type="hidden" name="id" value={g.id} />
                          <BotonEnviar className="boton boton-secundario" pendiente="…" confirmar={`¿Ya se le regresaron ${pesos(g.monto)} a ${nombre.get(e.persona) ?? "esta persona"}?`}>Marcar repuesto</BotonEnviar>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="seccion" aria-labelledby="t-gastos">
        <h2 id="t-gastos">Gastos desde la última reposición</h2>
        {!gastos?.length ? <p className="vacio">No hay gastos pendientes de reponer.</p> : (
          <div className="tabla-contenedor">
            <table className="tabla tabla-tarjetas">
              <thead><tr><th>Fecha</th><th>Concepto</th><th>Proveedor</th><th>Salió de</th><th>Comprobante</th><th>Foto</th><th>Monto</th></tr></thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id}>
                    <td data-label="Fecha">{g.fecha}</td><td data-label="Concepto">{g.concepto}</td><td data-label="Proveedor">{g.proveedor ?? ""}</td>
                    <td data-label="Salió de">{g.origen === "empleado" ? `${nombre.get(g.pagado_por ?? "") ?? "Empleado"}${g.repuesto_en ? " (repuesto)" : ""}` : NOMBRE_ORIGEN[g.origen]}</td>
                    <td data-label="Comprobante">{COMPROBANTE[g.comprobante]}</td>
                    <td data-label="Foto">{g.foto_path && urlFoto.get(g.foto_path) ? <a href={urlFoto.get(g.foto_path)} target="_blank" rel="noopener noreferrer">Ver foto</a> : ""}</td>
                    <td data-label="Monto" className="monto">{pesos(g.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
