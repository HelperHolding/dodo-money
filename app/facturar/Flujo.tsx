"use client";

import { useActionState, useState, useTransition } from "react";
import { Aviso } from "@/components/Aviso";
import { USOS_CFDI, pideTipoTarjeta, usosPermitidos, type UsoCfdi } from "@/lib/facturacion/reglas";
import { buscarTicket, facturar, leerConstanciaCliente, reenviar, type EstadoBusqueda, type EstadoFactura, type Ticket } from "./acciones";
import s from "./facturar.module.css";

const dinero = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const VACIO = { rfc: "", nombre: "", regimen_fiscal: "", codigo_postal: "", uso_cfdi: "", correo: "", tarjeta: "" };
type Fiscales = typeof VACIO;
type DatosTicket = { fecha: string; hora: string; total: string };
const FALLA = "No pudimos completar la solicitud. Intenta de nuevo en unos minutos.";

/** Ticket ya facturado: muestra el correo (enmascarado) y permite reenviar al mismo correo. */
function YaFacturado({ correo, datos }: { correo: string; datos: DatosTicket }) {
  const [reenvio, setReenvio] = useState<{ ok?: string; error?: string }>({});
  const [reenviando, iniciar] = useTransition();
  function pedir() {
    const fd = new FormData();
    for (const [k, v] of Object.entries(datos)) fd.set(k, v);
    iniciar(async () => {
      try {
        const r = await reenviar(fd);
        setReenvio(r.ok ? { ok: "Te la reenviamos al mismo correo." } : { error: r.error ?? FALLA });
      } catch {
        setReenvio({ error: FALLA });
      }
    });
  }
  return (
    <section className={s.tarjeta}>
      <Aviso ok={`Este ticket ya se facturó y se envió a ${correo}.`} />
      <Aviso error={reenvio.error} ok={reenvio.ok} />
      <button type="button" className={s.botonSecundario} disabled={reenviando} onClick={pedir}>{reenviando ? "Reenviando…" : "Reenviar factura"}</button>
    </section>
  );
}

function Facturacion({ ticket, datos, regimenes, fiscales, setFiscales }: {
  ticket: Ticket; datos: DatosTicket; regimenes: Readonly<Record<string, string>>; fiscales: Fiscales; setFiscales: React.Dispatch<React.SetStateAction<Fiscales>>;
}) {
  const [factura, emitir, emitiendo] = useActionState<EstadoFactura, FormData>(facturar, {});
  const [constancia, setConstancia] = useState<{ leyendo?: boolean; error?: string; ok?: string }>({});
  const poner = (nombre: keyof Fiscales, valor: string | null | undefined) => {
    if (valor) setFiscales((f) => ({ ...f, [nombre]: valor }));
  };
  const cambiar = (nombre: keyof Fiscales) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFiscales((f) => ({ ...f, [nombre]: e.target.value }));
  const usos = usosPermitidos(fiscales.regimen_fiscal);
  const uso = (usos as string[]).includes(fiscales.uso_cfdi) ? fiscales.uso_cfdi : (usos[0] ?? "");

  async function alElegirConstancia(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.currentTarget.files?.[0];
    if (!archivo) { setConstancia({}); return; }
    if (archivo.size > 1024 * 1024) { setConstancia({ error: "La constancia pesa más de 1 MB." }); return; }
    setConstancia({ leyendo: true });
    try {
      const fd = new FormData();
      fd.set("constancia", archivo);
      const r = await leerConstanciaCliente(fd);
      if (!r.datos) { setConstancia({ error: r.error ?? FALLA }); return; }
      poner("rfc", r.datos.rfc);
      poner("nombre", r.datos.nombre);
      poner("codigo_postal", r.datos.codigo_postal);
      poner("regimen_fiscal", r.datos.regimen && regimenes[r.datos.regimen] ? r.datos.regimen : null);
      setConstancia({ ok: r.datos.regimen ? "Llenamos los datos con tu constancia. Revísalos antes de facturar." : "Llenamos los datos con tu constancia. No reconocimos tu régimen: elígelo abajo." });
    } catch {
      setConstancia({ error: FALLA });
    }
  }

  if (factura.listo) {
    const base = `/facturar/descargar?f=${factura.listo.id}&t=${factura.listo.token}`;
    return (
      <section className={s.tarjeta}>
        <Aviso ok={factura.listo.correoEnviado ? "¡Listo! Te enviamos la factura a tu correo." : "¡Listo! Descárgala aquí; si no te llega el correo, usa Reenviar."} />
        <p className={s.folio}>Folio fiscal<br /><strong>{factura.listo.uuid}</strong></p>
        <a className={s.boton} href={`${base}&formato=pdf`}>Descargar PDF</a>
        <a className={s.botonSecundario} href={`${base}&formato=xml`}>Descargar XML</a>
      </section>
    );
  }
  if (factura.facturado) return <YaFacturado correo={factura.facturado.correo} datos={datos} />;

  return (
    <form action={emitir} className={s.tarjeta}>
      <h2>Tu ticket</h2>
      <ul className={s.productos}>
        {ticket.productos.map((p, i) => <li key={i}><span>{p.nombre}</span><span>{dinero(p.precio)}</span></li>)}
      </ul>
      <p className={s.total}><span>Total</span><strong>{dinero(ticket.total)}</strong></p>
      <input type="hidden" name="fecha" value={datos.fecha} />
      <input type="hidden" name="hora" value={datos.hora} />
      <input type="hidden" name="total" value={datos.total} />

      <h2>Datos fiscales</h2>
      <label className={s.campo}>Llenar con mi constancia (PDF del SAT, opcional)
        <input type="file" accept="application/pdf" onChange={alElegirConstancia} />
      </label>
      {constancia.leyendo && <p className={s.nota} role="status">Leyendo la constancia…</p>}
      <Aviso error={constancia.error} ok={constancia.ok} />
      <label className={s.campo}>RFC
        <input name="rfc" autoCapitalize="characters" autoComplete="off" required maxLength={13} value={fiscales.rfc} onChange={cambiar("rfc")} />
      </label>
      <label className={s.campo}>Nombre o razón social
        <input name="nombre" autoComplete="off" required value={fiscales.nombre} onChange={cambiar("nombre")} />
        <small>Sin S.A. de C.V., como en tu constancia</small>
      </label>
      <label className={s.campo}>Régimen fiscal
        <select name="regimen_fiscal" required value={fiscales.regimen_fiscal} onChange={cambiar("regimen_fiscal")}>
          <option value="">Elige tu régimen</option>
          {Object.entries(regimenes).map(([codigo, nombre]) => <option key={codigo} value={codigo}>{codigo} · {nombre}</option>)}
        </select>
      </label>
      <label className={s.campo}>Código postal
        <input name="codigo_postal" inputMode="numeric" autoComplete="postal-code" required maxLength={5} value={fiscales.codigo_postal} onChange={cambiar("codigo_postal")} />
      </label>
      <label className={s.campo}>Uso del CFDI
        <select name="uso_cfdi" required value={uso} onChange={cambiar("uso_cfdi")} disabled={!fiscales.regimen_fiscal}>
          {!fiscales.regimen_fiscal && <option value="">Primero elige tu régimen</option>}
          {fiscales.regimen_fiscal && usos.map((u: UsoCfdi) => <option key={u} value={u}>{u} · {USOS_CFDI[u]}</option>)}
        </select>
      </label>
      <label className={s.campo}>Correo
        <input name="correo" type="email" autoComplete="email" required value={fiscales.correo} onChange={cambiar("correo")} />
      </label>
      {pideTipoTarjeta(ticket.pago) && (
        <fieldset className={s.opciones}>
          <legend>Tipo de tarjeta</legend>
          <label><input type="radio" name="tarjeta" value="credito" required checked={fiscales.tarjeta === "credito"} onChange={() => poner("tarjeta", "credito")} /> Crédito</label>
          <label><input type="radio" name="tarjeta" value="debito" required checked={fiscales.tarjeta === "debito"} onChange={() => poner("tarjeta", "debito")} /> Débito</label>
        </fieldset>
      )}
      <Aviso error={factura.error} />
      {factura.procesando && <p className={s.aviso}>Estamos timbrando tu factura. Vuelve a intentar en unos minutos con los mismos datos; no se duplicará.</p>}
      <button className={s.boton} disabled={emitiendo}>{emitiendo ? "Facturando…" : "Facturar"}</button>
    </form>
  );
}

export function Flujo({ regimenes }: { regimenes: Readonly<Record<string, string>> }) {
  const [busqueda, buscar, buscando] = useActionState<EstadoBusqueda, FormData>(buscarTicket, {});
  // Los campos son controlados: al terminar una acción React vacía los no controlados, y el cliente perdería lo que escribió.
  const [campos, setCampos] = useState<DatosTicket>({ fecha: "", hora: "", total: "" });
  const [buscado, setBuscado] = useState<DatosTicket & { n: number }>({ fecha: "", hora: "", total: "", n: 0 });
  const [fiscales, setFiscales] = useState<Fiscales>(VACIO);

  const buscarConSnapshot = (fd: FormData) => {
    setBuscado((b) => ({ fecha: String(fd.get("fecha") ?? ""), hora: String(fd.get("hora") ?? ""), total: String(fd.get("total") ?? ""), n: b.n + 1 }));
    buscar(fd);
  };
  const datos: DatosTicket = { fecha: buscado.fecha, hora: buscado.hora, total: buscado.total };

  return (
    <>
      <form action={buscarConSnapshot} className={s.tarjeta}>
        <h2>Datos de tu ticket</h2>
        <label className={s.campo}>Fecha
          <input name="fecha" type="date" required max={hoy()} value={campos.fecha} onChange={(e) => setCampos({ ...campos, fecha: e.target.value })} />
        </label>
        <label className={s.campo}>Hora
          <input name="hora" type="time" required value={campos.hora} onChange={(e) => setCampos({ ...campos, hora: e.target.value })} />
        </label>
        <label className={s.campo}>Total
          <input name="total" inputMode="decimal" autoComplete="off" placeholder="Ej. 289.00" required value={campos.total} onChange={(e) => setCampos({ ...campos, total: e.target.value })} />
        </label>
        <Aviso error={busqueda.error} />
        <button className={s.boton} disabled={buscando}>{buscando ? "Buscando…" : "Buscar ticket"}</button>
      </form>

      {busqueda.facturado && <YaFacturado key={buscado.n} correo={busqueda.facturado.correo} datos={datos} />}
      {/* La llave reinicia el resultado de facturar cuando se hace otra búsqueda. */}
      {busqueda.ticket && <Facturacion key={buscado.n} ticket={busqueda.ticket} datos={datos} regimenes={regimenes} fiscales={fiscales} setFiscales={setFiscales} />}
    </>
  );
}
