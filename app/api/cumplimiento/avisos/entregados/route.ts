import { NextResponse, type NextRequest } from "next/server";
import { leerEntregados } from "@/lib/cumplimiento";
import { conCuentaAutomatizacion } from "../../cuenta";

export const dynamic = "force-dynamic";

/** n8n confirma lo que sí salió por un canal. Repetir el mismo POST no duplica nada. */
export async function POST(req: NextRequest) {
  return conCuentaAutomatizacion(req, async (supabase) => {
    const r = leerEntregados(await req.json().catch(() => null));
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    const { data, error } = await supabase.rpc("registrar_avisos_cumplimiento", { p_claves: r.claves, p_canal: r.canal });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ registrados: Number(data ?? 0) });
  });
}
