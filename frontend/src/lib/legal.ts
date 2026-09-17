/**
 * Versiones de los textos legales. Al cambiar el texto de /terminos o /privacidad,
 * actualiza la fecha: el consentimiento se registra con esta versión en
 * consent_records y así puede demostrarse qué texto aceptó cada usuario.
 *
 * NOTA INTERNA: los textos de src/pages/legal/* son un borrador estructurado y
 * requieren revisión jurídica antes de considerarse definitivos.
 */
export const LEGAL_VERSIONS = {
  terms: '2026-09-17',
  privacy: '2026-09-17',
} as const

export const LEGAL_ROUTES = {
  terms: '/terminos',
  privacy: '/privacidad',
} as const
