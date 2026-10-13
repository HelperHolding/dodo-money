import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const LLAVE_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

function errorConfiguracion(mensaje: string) {
  return new NextResponse(
    mensaje + "\n\nRevisa las variables en Vercel (Settings → Environment Variables) y vuelve a desplegar " +
      "(Deployments → ⋯ → Redeploy): las variables NEXT_PUBLIC_ se incluyen al compilar.",
    { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

function urlValida(valor: string) {
  try {
    const url = new URL(valor);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function actualizarSesion(request: NextRequest) {
  // Sin variables, createServerClient lanza un error y Vercel muestra MIDDLEWARE_INVOCATION_FAILED.
  if (!URL_SUPABASE || !LLAVE_SUPABASE) {
    return errorConfiguracion("Falta configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  if (!urlValida(URL_SUPABASE)) {
    return errorConfiguracion(
      `NEXT_PUBLIC_SUPABASE_URL no es una URL válida ("${URL_SUPABASE}"). ` +
        "Debe verse como https://abcdefgh.supabase.co, sin comillas ni espacios.",
    );
  }

  let response = NextResponse.next({ request });

  let supabase;
  try {
    supabase = createServerClient(URL_SUPABASE, LLAVE_SUPABASE, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista: { name: string; value: string; options: CookieOptions }[]) => {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
  } catch (error) {
    // Si el cliente no se puede crear aquí, las páginas también fallarían con un error genérico.
    console.error("Middleware de sesión:", error);
    return errorConfiguracion(`No se pudo crear el cliente de Supabase: ${error instanceof Error ? error.message : error}`);
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") console.error("Middleware de sesión:", error);

  const esLogin = request.nextUrl.pathname.startsWith("/login");
  // Se autentican con su propio header x-api-key, no con la sesión de cookies.
  const esReporteAutomatizado = request.nextUrl.pathname.startsWith("/api/reporte-semanal") || request.nextUrl.pathname.startsWith("/api/reporte-diario");

  const esInvitacion = request.nextUrl.pathname === "/auth/confirm" || request.nextUrl.pathname === "/invitacion";
  if (!user && !esLogin && !esReporteAutomatizado && !esInvitacion) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // Con ?error= el usuario llegó aquí porque le falta perfil o sucursal: mandarlo a / haría un ciclo.
  if (user && esLogin && !request.nextUrl.searchParams.has("error")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return response;
}
