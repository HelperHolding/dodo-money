import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { hoyCalendarioMX } from "@/lib/formato";
import { leerJsonRappi } from "@/lib/ventas/rappi";

export const dynamic = "force-dynamic";

/**
 * Recibe órdenes del historial de Rappi en JSON (extractor del portal, n8n) y las guarda con la misma
 * validación y RPC que el Excel. Body: { sucursal?, ordenes: OrdenRappi[], productos: {rappi_id,linea,nombre,opciones,cantidad,importe}[] }.
 * La sucursal se toma de la tienda ya ligada; solo hace falta mandarla la primera vez. Con ?revisar=1 valida sin guardar.
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || !process.env.RAPPI_API_KEY || apiKey !== process.env.RAPPI_API_KEY) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const texto = await req.text();
  if (texto.length > 4 * 1024 * 1024) return NextResponse.json({ error: "Envía un periodo más corto (hasta 4 MB)." }, { status: 413 });
  let datos: { sucursal?: unknown; ordenes?: unknown; productos?: unknown };
  try { datos = JSON.parse(texto); } catch { return NextResponse.json({ error: "El cuerpo no es JSON válido." }, { status: 400 }); }
  if (!datos || typeof datos !== "object") return NextResponse.json({ error: "El cuerpo no es JSON válido." }, { status: 400 });

  let lectura: ReturnType<typeof leerJsonRappi>;
  try { lectura = leerJsonRappi(datos, hoyCalendarioMX()); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Datos inválidos." }, { status: 422 }); }

  // El RPC exige un admin (edita_finanzas), así que esta cuenta de automatización debe tener rol admin.
  // Sin cuenta propia de Rappi se usa la misma de los reportes.
  const email = process.env.RAPPI_CUENTA_EMAIL || process.env.REPORTE_CUENTA_EMAIL, password = process.env.RAPPI_CUENTA_PASSWORD || process.env.REPORTE_CUENTA_PASSWORD;
  if (!email || !password) return NextResponse.json({ error: "Falta configurar la cuenta de automatización (RAPPI_CUENTA_EMAIL/PASSWORD o REPORTE_CUENTA_EMAIL/PASSWORD)" }, { status: 500 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim());
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) return NextResponse.json({ error: `No se pudo autenticar la cuenta de automatización: ${authError.message}` }, { status: 500 });

  const tiendaId = lectura.ordenes[0].tienda_id;
  const { data: tienda, error: errorTienda } = await supabase.from("rappi_tiendas").select("sucursal_id").eq("id", tiendaId).maybeSingle();
  if (errorTienda) return NextResponse.json({ error: errorTienda.message }, { status: 500 });
  const pedida = typeof datos.sucursal === "string" && datos.sucursal ? datos.sucursal : null;
  if (tienda && pedida && tienda.sucursal_id !== pedida) return NextResponse.json({ error: "Esta tienda Rappi ya está ligada a otra sucursal." }, { status: 409 });
  const sucursal = tienda?.sucursal_id ?? pedida;
  if (!sucursal) return NextResponse.json({ error: `La tienda ${tiendaId} aún no está ligada; manda "sucursal" la primera vez.` }, { status: 422 });

  const fechas = lectura.ordenes.map((o) => o.fecha).sort();
  const resumen = { tienda: tiendaId, sucursal, desde: fechas[0], hasta: fechas.at(-1), ordenes: lectura.ordenes.length, productos: lectura.productos.length };
  if (req.nextUrl.searchParams.get("revisar") === "1") return NextResponse.json({ revisado: true, ...resumen });

  const huella = createHash("sha256").update(texto).digest("hex");
  const archivo = `portal-rappi-${resumen.desde}_${resumen.hasta}.json`;
  const { data: r, error } = await supabase.rpc("importar_rappi", { p_sucursal: sucursal, p_archivo: archivo, p_huella: huella, p_ordenes: lectura.ordenes, p_productos: lectura.productos });
  if (error) return NextResponse.json({ error: error.message }, { status: 422 });
  revalidatePath("/ventas", "layout"); revalidatePath("/finanzas", "layout"); revalidatePath("/reporte");
  return NextResponse.json({ guardado: true, ...resumen, actualizadas: r.actualizadas });
}
