import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTodo } from "@/lib/ventas/paginar";
import type { Persona,PlantillaPuesto } from "@/lib/finanzas/personal";
export const leerPuestos=(supabase:SupabaseClient)=>supabase.from('personal_puestos').select('id,sucursal_id,nombre,datos,fuente,version_fuente').order('nombre').returns<PlantillaPuesto[]>();
export const leerPersonal = (supabase:SupabaseClient) => leerTodo<Persona>((d,h)=>supabase.from("personal").select("id,codigo,sucursal_id,personal_versiones(id,desde,hasta,datos,sustituida_en)").order("codigo").order("id").range(d,h).returns<Persona[]>());
