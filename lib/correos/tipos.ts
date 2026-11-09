export type EstadoEnvio = "pendiente" | "procesando" | "aceptado" | "problema";
export type Envio = { id: string; email: string; es_prueba: boolean; estado: EstadoEnvio; enviado_en: string | null; detalle: string | null;
  /** Estado actual del contacto; solo lo ve quien edita correos (null/ausente para los demás). */
  contacto?: { estado: "activo" | "baja" | "rebote" } | null };
export type Evento = { envio_id: string; tipo: "apertura" | "clic" | "baja"; enlace: string | null; sospechoso: boolean; creado_en: string };
export type EstadoCampana = "borrador" | "programada" | "enviando" | "detenida" | "enviada" | "cancelada";
export type Campana = { id: string; nombre: string; asunto: string; html: string; etiqueta: string | null; programada_para: string | null; estado: EstadoCampana; iniciada_en: string | null; terminada_en: string | null; creado_en: string };
export const NOMBRE_ESTADO: Record<EstadoCampana, string> = { borrador: "Borrador", programada: "Programada", enviando: "Enviando", detenida: "Detenida", enviada: "Enviada", cancelada: "Cancelada" };
/** "Go Big · 30 oct" → "go-big-30-oct" (para utm_campaign). */
export const slug = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "correo";
