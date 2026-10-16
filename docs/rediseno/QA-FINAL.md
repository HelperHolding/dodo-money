# QA final del rediseño (Fase 9)

Fecha: 2026-10-16 · Rama: `rediseno/f9-qa` · Plan: [PLAN-REDISENO.md](PLAN-REDISENO.md) §10

## Fases fusionadas

| Fase | PR | Qué cambió |
|---|---|---|
| F1 Fundaciones | [#2](https://github.com/sebascm0906/dodo-money/pull/2) | Tokens, Manrope con next/font, 4 radios, foco único |
| F2 Componentes | [#3](https://github.com/sebascm0906/dodo-money/pull/3) | Botones, iconos SVG, KPIs, insignias, encabezado, estado vacío |
| F3 Navegación | [#4](https://github.com/sebascm0906/dodo-money/pull/4) | Una sola "Recepciones", 7 grupos con iconos, barra inferior móvil |
| F4 Ventas | [#5](https://github.com/sebascm0906/dodo-money/pull/5) | Barra de periodo fija, nuevo orden, paleta validada |
| F8 Calendario | [#6](https://github.com/sebascm0906/dodo-money/pull/6) | Carga al tocar los días; sin botón "Ver este periodo" |
| F5 Sucursal y efectivo | [#7](https://github.com/sebascm0906/dodo-money/pull/7) | Saldos en tarjeta, avance de checklists, cuenta en el menú |
| F6 Compras y finanzas | [#8](https://github.com/sebascm0906/dodo-money/pull/8) | Colores a tokens, Rappi por categoría, tablas en celular |
| F7 Estados | [#9](https://github.com/sebascm0906/dodo-money/pull/9) | Pantallas de carga y de error en todas las áreas |

## 1. Auditoría del código (automática)

| Revisión | Resultado |
|---|---|
| Colores escritos a mano en componentes (`.tsx`) | **0** (fuera de reportes de impresión) |
| Colores fuera de tokens en `globals.css` | Solo 3 sombras con transparencia |
| `transition: all` | 0 |
| Radios fuera de la escala 6 / 10 / 16 / 999 | Solo el punto de la leyenda de la dona (3 px, a propósito) |
| Botones de solo icono sin `aria-label` | 0 |
| Glifos Unicode usados como icono | 0 (quedan ×, ▲▼, ↗ como texto: cantidades, cambios y enlace externo) |
| Reglas que quitan el contorno de foco sin reemplazo | 0 (las 3 que lo quitan ponen borde y halo) |

## 2. Mediciones en navegador

Con los componentes reales y datos ficticios (`/login-demo`, `/login-demo/sucursal`, `/login-demo/compras`, `/login-demo/estados`), a **375, 768, 1042 y 1440 px**:

| Revisión | Resultado |
|---|---|
| Scroll horizontal de la página | Ninguno |
| Contraste de texto (WCAG AA, medido sobre el fondo real) | 0 fallas |
| Objetivos táctiles < 40 px | 0 (tras corregir 2; ver abajo) |
| Texto < 12 px | Solo los montos del calendario en celular (10.9 px, ver excepciones) |
| Foco visible con teclado (Tab real) | Anillo `--anillo` 3 px en botones, enlaces y campos |
| Movimiento reducido | Regla global en `globals.css`; el esqueleto deja de brillar |

### Corregido en esta fase
- **Controles de 36 px a 40 px:** los accesos de pastilla (`.accesos a`) y las casillas de proveedor.
- **Desplegables sin estilo** (p. ej. "Simular un margen objetivo"): pasan de 26 px de alto a 40 px.
- **Leyenda de Rappi:** los porcentajes pasan de 11.3 px a 12 px.
- **Buscador de Compras:** el halo de foco pasa de 10 % a 25 %, como los demás campos.
- **Glifos usados como icono:** ▴▾ (proveedor) y ⚠ (vista general) pasan a iconos SVG.

### Excepciones aceptadas
- **Montos del calendario en celular (10.9 px):** caben 7 columnas en 343 px. El número del día mide 12.8 px y el monto exacto se lee en voz alta con `aria-label`. Ya era así antes del rediseño.
- **Barras de venta diaria en celular:** miden 37 px de ancho y 189 px de alto, así que el área táctil es amplia.

## 3. Pendiente: revisar con datos reales (Preview de Vercel o producción)

Esto no se puede comprobar con datos ficticios. Lo debe hacer alguien con sesión real:

- [ ] **Mismas cifras antes y después** en Ventas (un periodo conocido), Arqueo, P&L de un mes cerrado y una orden de compra.
- [ ] **Ventas:** tocar un día y luego otro carga el rango; el doble toque carga un día; el rango > 92 días avisa; el cambio de sucursal recarga.
- [ ] **Menú por puesto** (gerente, encargado, admin, corporativo): cada quien ve sus grupos. El admin ve una sola "Recepciones" con pestañas En tienda / De compras.
- [ ] **Mi contraseña:** con contraseña normal se abre dentro del menú; con contraseña temporal, en la pantalla mínima.
- [ ] **Celular de una sucursal real:** barra inferior, arqueo y checklists con el avance del día.
- [ ] **Impresión** de Reporte PDF y orden de compra: sin cambios (no se tocaron).

## 4. Fuera de alcance (siguientes pasos sugeridos)
- Adoptar `EstadoVacio` en los 67 textos de "vacío" donde haya una acción que proponer.
- 60 estilos en línea de una sola vez (anchos calculados, ajustes puntuales) que no afectan el diseño.
- Modo oscuro: los tokens ya están listos para agregarlo.
