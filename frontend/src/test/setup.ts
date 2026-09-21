import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { resetLanguageForTests } from '../i18n'

// Cada prueba arranca en español sin preferencia guardada (comportamiento por defecto de Feblio)
beforeEach(() => {
  resetLanguageForTests()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Variables de entorno mínimas para que src/lib/supabase.ts no falle al importarse
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
