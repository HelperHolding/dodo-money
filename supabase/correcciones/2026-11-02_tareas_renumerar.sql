-- Renumera las tareas desde 1 (T-001, T-002…) en el orden en que se crearon, y deja la numeración lista para la siguiente.
-- Las primeras empezaron en 80 porque las pruebas SQL de tareas consumían números de la secuencia aunque se revirtieran.
-- Las ligas viejas por número (/tareas/80) dejan de apuntar a la misma tarea; comentarios e historial no cambian.
-- Correr COMPLETO en el SQL Editor del proyecto de PRODUCCIÓN, cuando nadie esté creando tareas.
-- Ensayo: termina en ROLLBACK y muestra cómo quedaría. Si se ve bien, cambiar SOLO la última línea a COMMIT y volver a correr.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.tareas IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE tareas_renumero ON COMMIT DROP AS
SELECT id, numero AS antes, row_number() OVER (ORDER BY numero) AS nuevo FROM public.tareas;

-- En dos pasos para no chocar con el índice único de numero.
UPDATE public.tareas SET numero = -numero;
UPDATE public.tareas t SET numero = r.nuevo FROM tareas_renumero r WHERE r.id = t.id;

-- La siguiente tarea toma el número que sigue (o 1 si no hay ninguna). RESTART sí se revierte con ROLLBACK.
DO $$ BEGIN
  EXECUTE format('ALTER SEQUENCE public.tareas_numero RESTART WITH %s', (SELECT coalesce(max(numero), 0) + 1 FROM public.tareas));
END $$;

SELECT 'T-' || lpad(r.nuevo::text, 3, '0') AS clave_nueva, 'DODO-' || r.antes AS clave_anterior, t.titulo, p.nombre AS asignado
FROM tareas_renumero r JOIN public.tareas t ON t.id = r.id JOIN public.perfiles p ON p.id = t.asignado_a
ORDER BY r.nuevo;

ROLLBACK;
