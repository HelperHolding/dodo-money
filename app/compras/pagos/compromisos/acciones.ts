"use server";
import { revalidatePath } from "next/cache";
import { leerCompromiso } from "@/lib/compras/compromisos";
import { clienteAdmin, volver } from "../../servidor";

const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();

export async function guardarCompromiso(fd: FormData) {
  const id = texto(fd, "id");
  const ruta = id ? `/compras/pagos/compromisos/${id}/editar` : "/compras/pagos/compromisos/nuevo";
  const supabase = await clienteAdmin(ruta);
  const r = leerCompromiso((c) => texto(fd, c));
  if ("error" in r) return volver(ruta, "error", r.error);
  const { data, error } = await supabase.rpc("guardar_compromiso", { p_id: id || null, p_revision: Number(texto(fd, "revision") || 0), p_datos: r.datos });
  if (error) return volver(ruta, "error", error.message);
  revalidatePath("/compras/pagos", "layout");
  volver(`/compras/pagos/compromisos/${data}`, "ok", "Compromiso guardado.");
}
