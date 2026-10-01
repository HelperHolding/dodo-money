import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCompras } from "@/lib/roles";
import { guardarEmpresa } from "../acciones";

export default async function Empresa({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const { data: e } = await supabase.from("empresa").select("rfc, razon_social").maybeSingle<{ rfc: string; razon_social: string }>();
  const edita = puedeEditarCompras(perfil.rol);
  return (
    <>
      <div className="encabezado"><h1>Datos de la empresa</h1><p>Cada factura que se sube debe venir a nombre de este RFC.</p></div>
      <Aviso error={error} />
      {edita ? (
        <form action={guardarEmpresa} className="seccion formulario">
          <div className="rejilla">
            <div className="campo"><label htmlFor="rfc">RFC</label><input id="rfc" name="rfc" defaultValue={e?.rfc ?? ""} required autoCapitalize="characters" /></div>
            <div className="campo"><label htmlFor="razon_social">Razón social</label><input id="razon_social" name="razon_social" defaultValue={e?.razon_social ?? ""} required /></div>
          </div>
          <BotonEnviar>Guardar</BotonEnviar>
        </form>
      ) : (
        <section className="seccion"><dl className="tarjeta-datos"><dt>RFC</dt><dd>{e?.rfc ?? "Sin configurar"}</dd><dt>Razón social</dt><dd>{e?.razon_social ?? "—"}</dd></dl></section>
      )}
    </>
  );
}
