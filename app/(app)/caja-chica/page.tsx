import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto } from "@/lib/contexto";
import { hoyMX, pesos } from "@/lib/formato";
import { BUCKET_FOTOS } from "@/lib/fotos";
import { CampoFoto } from "./CampoFoto";
import { registrarGasto, solicitarReposicion } from "./actions";

type Gasto = { id: string; fecha: string; concepto: string; proveedor: string | null; monto: number; comprobante: string; creado_en: string; foto_path: string | null };
const COMPROBANTE: Record<string, string> = { cfdi: "Factura", nota: "Nota", sin_comprobante: "Sin comprobante" };

export default async function CajaChica({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, sucursal, soloLectura } = await obtenerContexto();

  const [{ data: ultima }, { data: saldo }] = await Promise.all([
    supabase.from("movimientos").select("creado_en").eq("sucursal_id", sucursal.id)
      .eq("tipo", "reposicion_caja_chica").neq("estado", "rechazado")
      .order("creado_en", { ascending: false }).limit(1).maybeSingle<{ creado_en: string }>(),
    supabase.from("saldos_cajas").select("saldo").eq("sucursal_id", sucursal.id).eq("tipo", "caja_chica")
      .maybeSingle<{ saldo: number }>(),
  ]);

  let consulta = supabase.from("gastos_caja_chica").select("id, fecha, concepto, proveedor, monto, comprobante, creado_en, foto_path")
    .eq("sucursal_id", sucursal.id).order("creado_en", { ascending: false });
  if (ultima) consulta = consulta.gt("creado_en", ultima.creado_en);
  const { data: gastos } = await consulta.returns<Gasto[]>();

  // Enlaces temporales (1 hora): las fotos están en un bucket privado.
  const rutas = (gastos ?? []).flatMap((g) => (g.foto_path ? [g.foto_path] : []));
  const { data: firmadas } = rutas.length
    ? await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(rutas, 3600)
    : { data: [] };
  const urlFoto = new Map((firmadas ?? []).flatMap((f) => (f.path && f.signedUrl ? [[f.path, f.signedUrl] as const] : [])));

  const porReponer = (gastos ?? []).reduce((s, g) => s + Number(g.monto), 0);
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
          <div className="saldo"><span>Gastos por reponer</span><span className="saldo-monto">{pesos(porReponer)}</span>
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

      <section className="seccion" aria-labelledby="t-gastos">
        <h2 id="t-gastos">Gastos desde la última reposición</h2>
        {!gastos?.length ? <p className="vacio">No hay gastos pendientes de reponer.</p> : (
          <div className="tabla-contenedor">
            <table className="tabla tabla-tarjetas">
              <thead><tr><th>Fecha</th><th>Concepto</th><th>Proveedor</th><th>Comprobante</th><th>Foto</th><th>Monto</th></tr></thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id}>
                    <td data-label="Fecha">{g.fecha}</td><td data-label="Concepto">{g.concepto}</td><td data-label="Proveedor">{g.proveedor ?? ""}</td>
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
