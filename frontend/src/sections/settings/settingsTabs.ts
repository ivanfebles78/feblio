export type SettingsTab = 'empresa' | 'integrations' | 'billing' | 'automation' | 'forms' | 'reopen'

export const SETTINGS_TAB_KEYS: SettingsTab[] = ['empresa', 'integrations', 'billing', 'automation', 'forms', 'reopen']

export function isSettingsTab(v: string | null): v is SettingsTab {
  return !!v && SETTINGS_TAB_KEYS.includes(v as SettingsTab)
}
