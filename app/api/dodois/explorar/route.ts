// Exploración de la API de Dodo IS (solo admin, solo lectura): devuelve tal cual lo que responde una ruta de la lista,
// con las unidades ligadas. Ej.: /api/dodois/explorar?ruta=/accounting/incoming-stock-items&desde=2026-10-01&hasta=2026-10-20
import { NextResponse } from "next/server";
import { obtenerPerfil } from "@/lib/contexto";
import { tokenDeAcceso } from "@/lib/dodois/cliente";
import { urlExplorar } from "@/lib/dodois/explorar";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { perfil } = await obtenerPerfil();
  if (perfil.rol !== "admin") return NextResponse.json({ error: "Solo admin." }, { status: 403 });
  const admin = crearClienteAdmin();
  const { data: sucursales } = await admin.from("sucursales").select("dodois_unit_id").not("dodois_unit_id", "is", null)
    .returns<{ dodois_unit_id: string }[]>();
  const destino = urlExplorar(new URL(request.url).searchParams, (sucursales ?? []).map((s) => s.dodois_unit_id));
  if ("error" in destino) return NextResponse.json(destino, { status: 400 });
  try {
    const token = await tokenDeAcceso(admin);
    const r = await fetch(destino.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(45_000) });
    const texto = await r.text();
    let cuerpo: unknown = texto;
    try { cuerpo = JSON.parse(texto); } catch { /* no es JSON */ }
    return NextResponse.json({ status: r.status, ruta: new URL(destino.url).pathname + new URL(destino.url).search, cuerpo });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
