import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const LLAVE_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function faltaConfiguracion() {
  return new NextResponse(
    "Falta configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en Vercel " +
      "(Settings → Environment Variables) y volver a desplegar.",
    { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

export async function actualizarSesion(request: NextRequest) {
  // Sin variables, createServerClient lanza un error y Vercel muestra MIDDLEWARE_INVOCATION_FAILED.
  if (!URL_SUPABASE || !LLAVE_SUPABASE) return faltaConfiguracion();

  let response = NextResponse.next({ request });

  try {
    const supabase = createServerClient(URL_SUPABASE, LLAVE_SUPABASE, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista: { name: string; value: string; options: CookieOptions }[]) => {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    const esLogin = request.nextUrl.pathname.startsWith("/login");

    if (!user && !esLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    if (user && esLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return response;
  } catch (error) {
    // Si Supabase no responde, se deja pasar: cada página vuelve a validar la sesión en el servidor.
    console.error("Middleware de sesión:", error);
    return response;
  }
}
