# Entregas parciales

Una entrega puede ser positiva y menor o igual al máximo protegido; su remanente queda disponible en bóveda. Los cierres del rango conservan exclusividad: el remanente no libera cierres ni permite volver a usar el mismo expediente. No se modifican saldos iniciales, arqueos históricos o diferencias para permitir la entrega.

El expediente nuevo conserva `permite_entrega_parcial`, `importe_preparado` y `remanente_disponible`. Los históricos conservan su explicación original. La preparación mantiene custodia pendiente y requiere después recogida y recepción por los responsables existentes.

Migración aplicada: `20261020013338_recolecciones_entregas_parciales.sql`. `migration.sql` en esta carpeta es la misma fuente para ensayos aislados; no ejecutarla nuevamente como otra migración.

Ensayos, con PGlite y TypeScript instalados previamente:

```sh
node docs/tecnica/entregas-parciales/test.mjs /absolute/path/to/pglite/dist/index.js
node docs/tecnica/entregas-parciales/qa.mjs /absolute/path/to/pglite/dist/index.js /absolute/path/to/typescript/lib/typescript.js tests/recoleccion-maximo-fixture.sql
```

Ambos usan PostgreSQL en memoria y no se conectan a Supabase. La vista completa verifica bandera y máximo; el registro completo verifica importes, rol, reservas, exclusividad e idempotencia. La revisión de TSX cubre sintaxis; el despliegue de Vercel realiza compilación del proyecto completo.
