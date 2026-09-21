/**
 * Formateadores de fecha de solicitudes y notificaciones: delegan en `lib/intl.ts`, que usa el
 * idioma actual de la interfaz (es-ES / en-GB). Se mantiene este módulo por compatibilidad.
 */
export { formatDate, formatDateTime, formatRelative } from '../intl'
