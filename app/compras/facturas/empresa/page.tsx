import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import type { DatosEmpresa } from "@/lib/compras/empresa";
import { nombreRegimen, REGIMENES } from "@/lib/compras/proveedores";
import { NOMBRE_DIA } from "@/lib/compras/diasPago";
import { puedeEditarCompras } from "@/lib/roles";
import { CampoConstancia } from "../../CampoConstancia";
import { guardarEmpresa } from "../acciones";

export default async function Empresa({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const { data: e } = await supabase.from("empresa").select("rfc, razon_social, regimen_fiscal, codigo_postal, domicilio, correo_compras, dias_pago")
    .maybeSingle<DatosEmpresa & { dias_pago: number[] | null }>();
  const diasPago = e?.dias_pago?.length ? e.dias_pago.map(Number) : [5];
  const edita = puedeEditarCompras(perfil.rol);
  const campo = (nombre: keyof DatosEmpresa, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="campo"><label htmlFor={nombre}>{etiqueta}</label><input id={nombre} name={nombre} defaultValue={e?.[nombre] ?? ""} {...extra} /></div>
  );
  return (
    <>
      <div className="encabezado">
        <h1>Datos de la empresa</h1>
        <p>Cada factura que se sube debe venir a nombre de este RFC. Estos datos van en el formato de la orden de compra.</p>
      </div>
      <Aviso error={error} />
      {edita ? (
        <form action={guardarEmpresa} className="seccion formulario">
          <CampoConstancia nota="La constancia de Dodo, descargada del portal del SAT: llena RFC, razón social, régimen y código postal." />
          <div className="rejilla">
            {campo("rfc", "RFC", { required: true, autoCapitalize: "characters" })}
            {campo("razon_social", "Razón social", { required: true })}
            <div className="campo">
              <label htmlFor="regimen_fiscal">Régimen fiscal</label>
              <select id="regimen_fiscal" name="regimen_fiscal" defaultValue={e?.regimen_fiscal ?? ""}>
                <option value="">Sin dato</option>
                {Object.entries(REGIMENES).map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
              </select>
            </div>
            {campo("codigo_postal", "Código postal", { inputMode: "numeric", maxLength: 5 })}
            {campo("domicilio", "Domicilio", { placeholder: "Calle, número, colonia, ciudad" })}
            {campo("correo_compras", "Correo de compras", { type: "email" })}
          </div>
          <fieldset className="campo">
            <legend>Días de pago autorizados</legend>
            <div className="acciones">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <label key={d}><input type="checkbox" name="dias_pago" value={d} defaultChecked={diasPago.includes(d)} /> {NOMBRE_DIA[d]}</label>
              ))}
            </div>
            <small>Los pagos a proveedores se programan solo en estos días; un pago otro día pide motivo.</small>
          </fieldset>
          <BotonEnviar>Guardar</BotonEnviar>
        </form>
      ) : (
        <section className="seccion">
          <dl className="tarjeta-datos">
            <dt>RFC</dt><dd>{e?.rfc ?? "Sin configurar"}</dd>
            <dt>Razón social</dt><dd>{e?.razon_social ?? "—"}</dd>
            <dt>Régimen fiscal</dt><dd>{e?.regimen_fiscal ? `${e.regimen_fiscal} · ${nombreRegimen(e.regimen_fiscal)}` : "—"}</dd>
            <dt>Domicilio</dt><dd>{[e?.domicilio, e?.codigo_postal && `CP ${e.codigo_postal}`].filter(Boolean).join(" · ") || "—"}</dd>
            <dt>Correo de compras</dt><dd>{e?.correo_compras ?? "—"}</dd>
          </dl>
        </section>
      )}
    </>
  );
}
