import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { datosPL } from "@/app/finanzas/datos";
import { datosVentas } from "@/app/ventas/datos";
import { anteriorDe, periodoMes } from "@/lib/finanzas/periodo";
import { hoyMX } from "@/lib/formato";

export const dynamic = "force-dynamic";

/**
 * Igual que /api/reporte-semanal pero para un mes completo (todas las sucursales), comparado contra el mes anterior.
 * Sin `mes` en la URL: el mes que acaba de cerrar (el cron corre el día 1).
 */
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.REPORTE_API_KEY) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const hoy = hoyMX();
  const mesParam = req.nextUrl.searchParams.get("mes");
  const mesValido = mesParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam);
  const actual = periodoMes(mesValido ? mesParam : mesAnterior(hoy), hoy);
  const anterior = anteriorDe(actual, hoy);

  const email = process.env.REPORTE_CUENTA_EMAIL;
  const password = process.env.REPORTE_CUENTA_PASSWORD;
  if (!email || !password) {
    return NextResponse.json({ error: "Falta configurar la cuenta de automatización (REPORTE_CUENTA_EMAIL/PASSWORD)" }, { status: 500 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim());
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    return NextResponse.json({ error: `No se pudo autenticar la cuenta de automatización: ${authError.message}` }, { status: 500 });
  }

  try {
    const [pl, ventas] = await Promise.all([
      datosPL(supabase, { desde: actual.desde, hasta: actual.hasta }),
      datosVentas(supabase, null, actual, anterior),
    ]);

    return NextResponse.json({
      periodo: { clave: actual.clave, titulo: actual.titulo, desde: actual.desde, hasta: actual.hasta, vacio: actual.vacio },
      anterior: { clave: anterior.clave, titulo: anterior.titulo, desde: anterior.desde, hasta: anterior.hasta },
      pl: {
        porSucursal: pl.porSucursal,
        oficina: pl.oficina,
        avisosOficina: pl.avisosOficina,
        consolidado: pl.consolidado,
      },
      ventas,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 });
  } finally {
    await supabase.auth.signOut();
  }
}

function mesAnterior(fecha: string): string {
  const [anio, mes] = fecha.split("-").map(Number);
  return mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, "0")}`;
}
