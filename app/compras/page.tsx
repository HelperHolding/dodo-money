import {obtenerPerfil} from "@/lib/contexto";
import {leerTodo} from "@/lib/ventas/paginar";
import {puedeEditarCompras} from "@/lib/roles";
import type {Documento} from "@/lib/compras/documentos";
import {ListaProveedores,type Fila} from "./ListaProveedores";
export default async function Proveedores({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; inactivos?: string; docs?: string; vista?: string; ok?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const [filas, documentos] = await Promise.all([
    leerTodo<Fila>((desde, hasta) => supabase.from("proveedores")
      .select("id, razon_social, nombre_comercial, numero_cliente, dias_entrega, rfc, dias_credito, categorias, activo")
      .order("razon_social").order("id").range(desde, hasta).returns<Fila[]>()),
    leerTodo<Documento & { proveedor_id: string }>((desde, hasta) => supabase.from("documentos_proveedor")
      .select("id, proveedor_id, tipo, fecha, subido_en").order("id").range(desde, hasta).returns<(Documento & { proveedor_id: string })[]>()),
  ]);
  return <ListaProveedores filas={filas} documentos={documentos} params={params} edita={puedeEditarCompras(perfil.rol)}/>;
}
