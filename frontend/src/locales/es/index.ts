import common from './common.json'
import auth from './auth.json'
import onboarding from './onboarding.json'
import dashboard from './dashboard.json'
import settings from './settings.json'
import requests from './requests.json'
import legal from './legal.json'
import admin from './admin.json'
import client from './client.json'
import intake from './intake.json'
import integrations from './integrations.json'

/** Recursos del idioma agrupados por área: cada archivo es un espacio de claves de primer nivel (common.*, auth.*, …). */
export const es = { common, auth, onboarding, dashboard, settings, requests, legal, admin, client, intake, integrations } as const
