import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarCompras, puedeVerCompras } from "@/lib/roles";
import { FILTROS_ESTADO, ORIGENES, TIPOS, contarAlertas, ventanaAlertas, ventanaCalendario, type FiltroEstado } from "@/lib/cumplimiento";
import { leerFilas, leerOpciones } from "./datos";
import { CalendarioCumplimiento } from "./CalendarioCumplimiento";
import { FranjaAlertas } from "./FranjaAlertas";

export default async function Cumplimiento({ searchParams }: { searchParams: Promise<{ origen?: string; estado?: string; ambito?: string; tipo?: string; ok?: string; error?: string }> }) {
  const p = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerCompras(perfil.rol)) redirect("/");
  const hoy = hoyCalendarioMX(), cal = ventanaCalendario(hoy), al = ventanaAlertas(hoy);
  let filas, alertas, ambitos;
  try {
    const [f, a, o] = await Promise.all([leerFilas(supabase, cal.desde, cal.hasta, hoy), leerFilas(supabase, al.desde, al.hasta, hoy), leerOpciones(supabase)]);
    filas = f; alertas = contarAlertas(a, hoy); ambitos = o.ambitos;
  } catch { return <p className="aviso aviso-error">No se pudo consultar el calendario de cumplimiento. Revisa que la migración 20261029150000 esté aplicada y vuelve a intentar.</p>; }
  const inicial = {
    origen: p.origen && Object.hasOwn(ORIGENES, p.origen) ? p.origen : "",
    estado: (p.estado && Object.hasOwn(FILTROS_ESTADO, p.estado) ? p.estado : "vigentes") as FiltroEstado,
    ambito: p.ambito ?? "",
    tipo: p.tipo && Object.hasOwn(TIPOS, p.tipo) ? p.tipo : "",
  };
  return <>
    <EncabezadoPagina titulo="Calendario de cumplimiento" descripcion="Permisos, licencias, protección civil, extintores, trámites fiscales, seguros, servicios fijos y mantenimiento de activos."
      acciones={puedeEditarCompras(perfil.rol) && <Link className="boton" href="/cumplimiento/nueva">Nueva obligación</Link>} />
    <Aviso ok={p.ok} error={p.error} />
    <FranjaAlertas alertas={alertas} />
    <CalendarioCumplimiento key={`${inicial.origen}:${inicial.estado}:${inicial.ambito}:${inicial.tipo}`} filas={filas} hoy={hoy} inicial={inicial} ambitos={ambitos} />
  </>;
}
