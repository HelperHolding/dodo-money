import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto } from "@/lib/formato";
import { nombreRegimen } from "@/lib/compras/proveedores";
import { NOMBRE_CATEGORIA_COMPRA, NOMBRE_FORMA_PAGO, type DatosProveedor } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { cambiarActivoProveedor } from "../../acciones";
import { FormProveedor } from "../../FormProveedor";

type Proveedor = DatosProveedor & { id: string; activo: boolean; motivo_desactivacion: string | null; desactivado_en: string | null };

export default async function FichaProveedor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const { data: p } = await supabase.from("proveedores")
    .select("id, razon_social, nombre_comercial, rfc, regimen_fiscal, contacto_nombre, telefono, correo, banco, clabe, cuenta, dias_credito, forma_pago_habitual, categorias, notas, activo, motivo_desactivacion, desactivado_en")
    .eq("id", id).maybeSingle<Proveedor>();
  if (!p) notFound();
  const edita = puedeEditarCompras(perfil.rol);

  return (
    <>
      <div className="encabezado">
        <h1>{p.nombre_comercial ?? p.razon_social}</h1>
        <p>{p.rfc}{p.activo ? "" : " · inactivo"}</p>
      </div>
      <Aviso ok={ok} error={error} />
      <section className="seccion">
        <dl className="tarjeta-datos">
          <dt>Razón social</dt><dd>{p.razon_social}</dd>
          <dt>Régimen fiscal</dt><dd>{p.regimen_fiscal} · {nombreRegimen(p.regimen_fiscal)}</dd>
          <dt>Contacto</dt><dd>{[p.contacto_nombre, p.telefono, p.correo].filter(Boolean).join(" · ") || "—"}</dd>
          <dt>Banco</dt><dd>{[p.banco, p.clabe && `CLABE ${p.clabe}`, p.cuenta && `Cuenta ${p.cuenta}`].filter(Boolean).join(" · ") || "—"}</dd>
          <dt>Crédito</dt><dd>{p.dias_credito ? `${p.dias_credito} días` : "Contado"} · {NOMBRE_FORMA_PAGO[p.forma_pago_habitual]}</dd>
          <dt>Surte</dt><dd>{p.categorias.map((c) => NOMBRE_CATEGORIA_COMPRA[c]).join(", ") || "Sin categoría"}</dd>
          {p.notas && <><dt>Notas</dt><dd>{p.notas}</dd></>}
          {!p.activo && <><dt>Desactivado</dt><dd>{p.motivo_desactivacion}{p.desactivado_en ? ` · ${fechaTexto(p.desactivado_en.slice(0, 10))}` : ""}</dd></>}
        </dl>
      </section>
      {edita && (
        <>
          <details className="seccion">
            <summary>Editar datos</summary>
            <FormProveedor id={p.id} inicial={p} />
          </details>
          <form action={cambiarActivoProveedor} className="acciones">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="activo" value={p.activo ? "no" : "si"} />
            {p.activo && <div className="campo"><label htmlFor="motivo">Motivo para desactivar</label><input id="motivo" name="motivo" required placeholder="Ej. dejó de surtir, cerró" /></div>}
            <BotonEnviar className={p.activo ? "boton boton-alerta" : "boton boton-secundario"}
              confirmar={p.activo ? "¿Desactivar este proveedor? Ya no aparecerá para nuevas compras; su historial se conserva." : undefined}>
              {p.activo ? "Desactivar proveedor" : "Reactivar proveedor"}
            </BotonEnviar>
          </form>
        </>
      )}
    </>
  );
}
