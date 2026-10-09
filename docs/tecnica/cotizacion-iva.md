# IVA por renglón en cotizaciones

En Editar de cada renglón se selecciona IVA 16 %, 0 % o exento y se guarda junto a cantidad y precio. La acción valida contra TASAS_IVA antes de actualizar; el precio unitario no se transforma al cambiar tasa. Subtotal, IVA y total se recalculan con totalesOrden. La factura creada desde la orden utiliza las tasas guardadas.

No modifica el artículo ni otros documentos. Conserva permisos y trigger orden_renglones_editables: solo cotizaciones editables, no órdenes confirmadas. No necesita migración. IVA 0 % y exento son las clasificaciones existentes; no se infiere tratamiento fiscal por pagar en efectivo ni se añade IEPS.
