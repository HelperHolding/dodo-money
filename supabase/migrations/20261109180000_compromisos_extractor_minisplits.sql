-- Compromisos de mantenimiento de extractor (cada 6 meses) y de minisplits (cada 2 meses). Comprueban servicio como la
-- fumigación, así que salen en el calendario de cumplimiento sin más cambios. Solo se amplía la lista de conceptos.
begin;
alter table public.compromisos drop constraint compromisos_concepto,
 add constraint compromisos_concepto check(concepto in ('renta','fumigacion','basura','trampas_grasa','internet','telefono','extractor','minisplits','otro'));
commit;
