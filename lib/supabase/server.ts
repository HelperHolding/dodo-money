import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { COOKIES_SESION } from "@/lib/seguridad";

export async function crearClienteServidor() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    {
      cookieOptions: COOKIES_SESION,
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (lista: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            lista.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // En componentes de servidor no se pueden escribir cookies; el middleware renueva la sesión.
          }
        },
      },
    },
  );
}
