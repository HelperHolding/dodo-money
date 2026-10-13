import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { datosPL } from "@/app/finanzas/datos";
import { datosVentas } from "@/app/ventas/datos";
import type { Periodo } from "@/lib/finanzas/periodo";
import { sumarDias } from "@/lib/finanzas/periodo";
import { fechaTexto, hoyMX } from "@/lib/formato";

export const dynamic = "force-dynamic";

/**
 * Igual que /api/reporte-semanal pero para un solo día (todas las sucursales). Por default, el día
 * de operación anterior a hoy (el cron corre temprano, reportando el día que acaba de cerrar).
 */
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.REPORTE_API_KEY) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const hoy = hoyMX();
  const fechaParam = req.nextUrl.searchParams.get("fecha");
  const fechaValida = fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam);
  const fecha = fechaValida ? fechaParam : sumarDias(hoy, -1);
  const fechaAnterior = sumarDias(fecha, -1);

  // Solo se usan `desde`/`hasta` de este objeto en datosVentas; el resto son campos de relleno para el tipo.
  const periodoDeUnDia = (f: string): Periodo => ({
    tipo: "semana", clave: f, desde: f, hasta: f, finNominal: f, titulo: `Día ${fechaTexto(f)} de ${f.slice(0, 4)}`, vacio: false,
  });
  const actual = periodoDeUnDia(fecha);
  const anterior = periodoDeUnDia(fechaAnterior);

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
      datosPL(supabase, { desde: fecha, hasta: fecha }),
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
