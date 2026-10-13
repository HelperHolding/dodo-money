import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { datosPL } from "@/app/finanzas/datos";
import { datosVentas } from "@/app/ventas/datos";
import { anteriorDe, periodoSemana, semanaISO } from "@/lib/finanzas/periodo";
import { hoyMX } from "@/lib/formato";

export const dynamic = "force-dynamic";

/**
 * Datos ya calculados (P&L + ventas, todas las sucursales) de una semana, para consumo de automatizaciones
 * externas (n8n). Autenticación: header `x-api-key` contra REPORTE_API_KEY. Los datos se leen con la sesión
 * de REPORTE_CUENTA_EMAIL/PASSWORD, así que el alcance depende del rol de esa cuenta (RLS normal).
 */
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.REPORTE_API_KEY) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const hoy = hoyMX();
  const semanaParam = req.nextUrl.searchParams.get("semana");
  const semanaValida = semanaParam && /^\d{4}-W\d{2}$/.test(semanaParam);
  // Sin `semana` en la URL: la última semana completa (el cron corre después de que cierra).
  const clave = semanaValida ? semanaParam : semanaISO(sumarSemana(hoy, -1));
  const actual = periodoSemana(clave, hoy);
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

function sumarSemana(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}
