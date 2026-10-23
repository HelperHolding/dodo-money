import datos from './catalogoHelper.datos.json' with { type: 'json' };

export type EntidadHelper = '03' | '06';
export const FUENTE_HELPER = { archivo: datos.fuente, sha256: datos.sha256, hoja: datos.hoja };
export const ENTIDADES_HELPER = { '03': 'COMERCIALIZADORA MASTER SITRU', '06': 'HELPER COMERCIALIZADORA MASTER' } as const;
export type CuentaHelper = { codigo:string; nombre:string; nivel:number; naturaleza:string; agrupador:string|null; rubro:string|null; nombreRubro:string|null; entidades:string[]; fila:number };
export const CATALOGO_HELPER: readonly CuentaHelper[] = datos.cuentas;

/** Correspondencia del reporte, no asignación fiscal a cada documento. Las categorías amplias conservan sus alternativas. */
export const MAPEO_HELPER: Record<string, { rubro:string; cuentas:readonly string[]; nota?:string }> = {
  venta_neta_dodo:{rubro:'R101',cuentas:['401-01-101']},
  venta_neta_rappi:{rubro:'R102',cuentas:['401-01-102'],nota:'Referencia de catálogo; conserva el desglose financiero conciliado de Rappi.'},
  alimento:{rubro:'R201',cuentas:['501-01-101']},
  merma_productos:{rubro:'R202',cuentas:['501-01-102']},
  merma_insumos:{rubro:'R203',cuentas:['501-01-103']},
  nomina_cocina:{rubro:'R301',cuentas:['602-01-101'],nota:'La nómina puede incluir prestaciones y cargas en cuentas adicionales.'},
  nomina_gerencia:{rubro:'R302',cuentas:['602-01-102'],nota:'La nómina puede incluir prestaciones y cargas en cuentas adicionales.'},
  repartidores:{rubro:'R303',cuentas:['602-01-103','602-72-101'],nota:'Distinguir personal propio y servicio tercerizado.'},
  agregadores:{rubro:'R304',cuentas:['602-74-101']},
  marketing_agregadores:{rubro:'R305',cuentas:['602-61-101']},
  marketing:{rubro:'R306',cuentas:['602-61-102','602-61-103'],nota:'Distinguir publicidad local y fondo de marca.'},
  renta:{rubro:'R307',cuentas:['602-45-101','602-46-101','602-46-008'],nota:'Revisar arrendador antes de asignar una cuenta exacta.'},
  servicios:{rubro:'R308',cuentas:['602-52-000','602-51-000','602-48-101','602-50-000'],nota:'Desglosar luz, agua, gas e internet.'},
  mantenimiento:{rubro:'R309',cuentas:['602-56-000']},
  consumibles_equipo:{rubro:'R310',cuentas:['602-84-101']},
  regalias:{rubro:'R311',cuentas:['602-71-004'],nota:'Cuenta principal propuesta; verificar contraparte de cada cargo.'},
  otros:{rubro:'R312 / R319',cuentas:['602-84-000','602-83-101','602-83-102','602-75-000'],nota:'Contiene categorías mezcladas; TPV corresponde a R312. Pendiente separar por movimiento.'},
  oficina:{rubro:'R402',cuentas:['603-33-002','603-33-007','603-33-004'],nota:'Referencia propuesta de servicios administrativos; no asignar una contraparte a todo el prorrateo.'},
  memo_insumos:{rubro:'R201 · memo',cuentas:['502-01-000','502-02-003'],nota:'Compras informativas; conservar fuera del resultado para no duplicar con costo de venta, aunque el maestro les asigne R201.'},
  memo_inversiones:{rubro:'B201',cuentas:['153-01-000','155-01-000','156-01-000','170-01-000'],nota:'Elegir la clase de activo. No cargar toda inversión al resultado.'},
};

export function cuentasHelper(entidad:EntidadHelper, busqueda='') {
  const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const terminos=normal(busqueda.trim()).split(/\s+/).filter(Boolean);
  return CATALOGO_HELPER.filter(c=>c.entidades.includes(entidad) && terminos.every(t=>normal(`${c.codigo} ${c.nombre} ${c.agrupador??''} ${c.rubro??''} ${c.nombreRubro??''}`).includes(t)));
}

export function referenciaHelper(clave:string):string|null {
  const m=MAPEO_HELPER[clave];
  return m ? `${m.rubro} · ${m.cuentas.join(' / ')}${m.cuentas.length>1?' · requiere desglose':''}` : null;
}
