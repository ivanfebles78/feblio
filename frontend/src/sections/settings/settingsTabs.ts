export type SettingsTab = 'empresa' | 'integrations' | 'billing' | 'automation' | 'forms' | 'reopen'

export const SETTINGS_TAB_KEYS: SettingsTab[] = ['empresa', 'integrations', 'billing', 'automation', 'forms', 'reopen']

export function isSettingsTab(v: string | null): v is SettingsTab {
  return !!v && SETTINGS_TAB_KEYS.includes(v as SettingsTab)
}

/** Clave de traducción del nombre de cada pestaña: resolver con t() al renderizar (los códigos no cambian). */
export function settingsTabLabelKey(tab: SettingsTab): string {
  return `settings.tabs.${tab}`
}
