-- Corrección: el cierre financiero de Rappi del 2 al 21/10 de Dodo La Calma quedó con COMERCIALIZADORA MASTER SITRU
-- (CMS230321FI8); el aliado del reporte de Rappi es HELPER COMERCIALIZADORA MASTER (HCM260306B93). Confirmado por Sebastián el 30/10/2026.
-- Cambia solo la razón social de esa importación (y la deja anotada en su motivo) para que el reporte del 2 al 29/10
-- la sustituya con HELPER desde Banca → Rappi. No toca movimientos, archivo original, cortes, pagos ni ventas.
-- Se detiene si trae CFDI de comisión distintos a los dos emitidos a HELPER, facturas de Rappi a SITRU o conciliaciones bancarias ligadas.
-- Ejecutar COMPLETO. Ensayo: ROLLBACK final. Tras ver "LISTO PARA GUARDAR", cambiar SOLO la última línea a COMMIT y volver a ejecutar.
BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.rappi_fin_importaciones IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE resultado_correccion(resultado text,archivo text,desde date,hasta date,rfc_antes text,rfc_despues text,movimientos integer) ON COMMIT DROP;
DO $$
DECLARE
 sitru constant text:='CMS230321FI8';
 helper constant text:='HCM260306B93';
 nota constant text:=' · Corrección 2026-10-30: razón social HCM260306B93 (HELPER COMERCIALIZADORA MASTER), aliado del reporte de Rappi; antes CMS230321FI8.';
 imp public.rappi_fin_importaciones; n integer;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Ejecuta como postgres.';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.razones_sociales WHERE rfc=helper AND activa AND principal) THEN RAISE EXCEPTION 'HELPER no está activa como razón principal.';END IF;
 SELECT count(*) INTO n FROM public.rappi_fin_importaciones i JOIN public.sucursales s ON s.id=i.sucursal_id
  WHERE i.sustituida_en IS NULL AND s.nombre='Dodo La Calma (Dodo-1)';
 IF n<>1 THEN RAISE EXCEPTION 'Se esperaba un solo reporte financiero activo en Dodo La Calma; hay %.',n;END IF;
 SELECT i.* INTO imp FROM public.rappi_fin_importaciones i JOIN public.sucursales s ON s.id=i.sucursal_id
  WHERE i.sustituida_en IS NULL AND s.nombre='Dodo La Calma (Dodo-1)';
 IF imp.rfc=helper THEN
  INSERT INTO resultado_correccion VALUES('YA ESTABA CON HELPER · SIN CAMBIOS',imp.archivo,imp.desde,imp.hasta,helper,helper,jsonb_array_length(imp.reporte->'movimientos'));
  RETURN;
 END IF;
 IF imp.rfc<>sitru OR imp.archivo<>'Rappi_DODO_Cierre_Octubre_2026.xlsx' OR imp.desde<>'2026-10-02' OR imp.hasta<>'2026-10-21' THEN
  RAISE EXCEPTION 'El reporte activo no es el esperado: % · % · % al %.',imp.rfc,imp.archivo,imp.desde,imp.hasta;END IF;
 -- Los dos CFDI de comisión del reporte (GDL-20-1160226 y GDL-20-1162552) se emitieron a HELPER (RFC HCM260306B93),
 -- según la hoja "Facturas de comisión" del mismo archivo. Cualquier otro CFDI detiene la corrección.
 IF (SELECT coalesce(array_agg(lower(x) ORDER BY lower(x)),'{}') FROM jsonb_array_elements_text(coalesce(imp.reporte->'uuidsComision','[]')) x)
    IS DISTINCT FROM array['631f11db-c3bd-46a8-aadf-28dd3a0fb5df','f8523d0f-a5ce-404e-93c9-988d97b2ed76'] THEN
  RAISE EXCEPTION 'El reporte trae CFDI de comisión distintos a los dos emitidos a HELPER: %.',imp.reporte->'uuidsComision';END IF;
 IF EXISTS(SELECT 1 FROM public.facturas f WHERE lower(f.uuid) IN ('631f11db-c3bd-46a8-aadf-28dd3a0fb5df','f8523d0f-a5ce-404e-93c9-988d97b2ed76') AND f.rfc_receptor<>helper) THEN
  RAISE EXCEPTION 'Un CFDI de comisión está capturado en Compras con otro RFC receptor.';END IF;
 IF EXISTS(SELECT 1 FROM public.facturas f WHERE f.rfc_receptor=sitru AND f.estado<>'cancelada' AND f.nombre_emisor ILIKE '%rappi%') THEN
  RAISE EXCEPTION 'Hay facturas de Rappi emitidas a SITRU: confirma con contabilidad que el aliado es HELPER.';END IF;
 IF EXISTS(SELECT 1 FROM public.banca_conciliacion_documentos d WHERE d.rappi_importacion_id=imp.id AND d.activa) THEN
  RAISE EXCEPTION 'Hay conciliaciones bancarias ligadas a este reporte; deshazlas antes de cambiar la razón social.';END IF;
 IF length(imp.motivo||nota)>1000 THEN RAISE EXCEPTION 'El motivo quedaría demasiado largo.';END IF;
 UPDATE public.rappi_fin_importaciones
  SET rfc=helper,solicitud=jsonb_set(solicitud,'{rfc}',to_jsonb(helper)),motivo=motivo||nota
  WHERE id=imp.id AND rfc=sitru AND sustituida_en IS NULL;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'No se actualizó exactamente un reporte.';END IF;
 INSERT INTO resultado_correccion VALUES('LISTO PARA GUARDAR',imp.archivo,imp.desde,imp.hasta,sitru,helper,jsonb_array_length(imp.reporte->'movimientos'));
END $$;
SELECT *, 'ROLLBACK ensaya; COMMIT guarda ejecutando siempre el archivo completo' AS modo FROM resultado_correccion;
ROLLBACK;
