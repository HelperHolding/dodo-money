import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { llaveValida } from "@/lib/cumplimiento";

/** Valida `x-api-key` contra CUMPLIMIENTO_API_KEY y corre `fn` con la sesión de la cuenta de automatización
 * (REPORTE_CUENTA_EMAIL/PASSWORD, rol admin): RLS normal, sin llave de servicio. */
export async function conCuentaAutomatizacion(req: NextRequest, fn: (supabase: SupabaseClient) => Promise<NextResponse>): Promise<NextResponse> {
  if (!llaveValida(req.headers.get("x-api-key"), process.env.CUMPLIMIENTO_API_KEY)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const email = process.env.REPORTE_CUENTA_EMAIL, password = process.env.REPORTE_CUENTA_PASSWORD;
  if (!email || !password) return NextResponse.json({ error: "Falta configurar la cuenta de automatización (REPORTE_CUENTA_EMAIL/PASSWORD)" }, { status: 500 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim());
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: `No se pudo autenticar la cuenta de automatización: ${error.message}` }, { status: 500 });
  try { return await fn(supabase); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 }); }
  finally { await supabase.auth.signOut(); }
}
