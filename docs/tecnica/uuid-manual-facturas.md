# UUID manual sin XML

Requiere migración y pruebas 0070 antes de publicar. Desde una prefactura vigente de ingreso sin XML, administración puede capturar o corregir el UUID con motivo. Se normaliza a mayúsculas y se exige el formato de 36 caracteres. Dejar vacío un UUID existente lo retira con historial. Una pantalla desactualizada no sobrescribe el dato de otra persona.

Se almacena en uuid_manual, separado del UUID leído de XML. No cambia origen, importes, cuentas, pagos, saldo ni recepción. La ficha muestra «capturado manualmente · XML pendiente» y el Excel de Tesorería usa el UUID de XML o, cuando falta, el manual con una advertencia de fuente. No acredita validación fiscal.

Un trigger protege unicidad entre UUID manuales y XML, incluso en capturas/importaciones concurrentes. Si después se adjunta un XML, su UUID debe coincidir con el manual; en caso contrario hay que corregir el dato manual con motivo primero. Para evitar duplicados se debe convertir la misma prefactura con «Convertir con XML». El historial conserva anterior, nuevo, motivo, autor y fecha; también se agrega una nota en la factura.

Las pruebas SQL son reversibles y deben ejecutarse en Supabase. El mensaje PRUEBAS OK es una excepción intencional que revierte los registros del ensayo.
