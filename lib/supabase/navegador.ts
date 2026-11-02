"use client";
import {createBrowserClient} from "@supabase/ssr";

// Un solo cliente por pestaña: lee la sesión de las cookies que deja el servidor; Realtime la usa para respetar RLS.
let cliente:ReturnType<typeof createBrowserClient>|null=null;
export function clienteNavegador() {
  cliente??=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim());
  return cliente;
}
