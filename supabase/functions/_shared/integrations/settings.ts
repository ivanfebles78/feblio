// Feblio · Lectura tipada de integration_connections.settings (sin secretos).
import type { Connection } from './db.ts'

export const labelsOf = (c: Connection): string[] => (Array.isArray(c.settings?.labels) ? (c.settings.labels as string[]) : [])
export const rootOf = (c: Connection): string | null => (typeof c.settings?.root_folder_id === 'string' ? (c.settings.root_folder_id as string) : null)
