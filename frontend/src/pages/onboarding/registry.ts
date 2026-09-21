import type { ComponentType } from 'react'
import { t } from '../../i18n'
import type { OnboardingContextValue } from '../../lib/onboarding/OnboardingContext'
import type { OnboardingStepKey, EmailStepData, RepositoryStepData, SmsStepData, VoiceStepData, WhatsAppStepData } from '../../lib/onboarding/types'
import {
  validateAutomation,
  validateBilling,
  validateCompany,
  validateEmailStep,
  validateRepository,
  validateSms,
  validateVoice,
  validateWhatsApp,
  type CompanyDraft,
  type FieldErrors,
} from '../../lib/onboarding/validation'
import { defaultEmailData, defaultRepositoryData, defaultSmsData, defaultVoiceData, defaultWhatsAppData } from '../../lib/onboarding/steps'
import { companyDraftFromSnapshot } from './steps/companyDraft'
import { CompanyAndOwnerStep } from './steps/CompanyAndOwnerStep'
import { DocumentRepositoryStep } from './steps/DocumentRepositoryStep'
import { EmailChannelStep } from './steps/EmailChannelStep'
import { WhatsAppChannelStep } from './steps/WhatsAppChannelStep'
import { SmsChannelStep } from './steps/SmsChannelStep'
import { VoiceChannelStep } from './steps/VoiceChannelStep'
import { FormsStep } from './steps/FormsStep'
import { AutomationRulesStep } from './steps/AutomationRulesStep'
import { BillingSettingsStep, ibanDraftRef } from './steps/BillingSettingsStep'
import { ReviewAndActivateStep } from './steps/ReviewAndActivateStep'
import type { StepProps } from './steps/types'

export interface StepEntry {
  Component: ComponentType<StepProps>
  /** Errores de campo del paso según el estado actual */
  validate: (ctx: OnboardingContextValue) => FieldErrors
  /** Motivo adicional para bloquear "Siguiente" */
  blocked?: (ctx: OnboardingContextValue) => string | undefined
}

type R = Record<string, unknown>

export const STEP_REGISTRY: Record<OnboardingStepKey, StepEntry> = {
  company: {
    Component: CompanyAndOwnerStep,
    validate: (ctx) => validateCompany(ctx.getStepData('company', () => companyDraftFromSnapshot(ctx.snapshot) as unknown as R) as unknown as CompanyDraft),
  },
  repository: {
    Component: DocumentRepositoryStep,
    validate: (ctx) => {
      const d = ctx.getStepData('repository', defaultRepositoryData as () => RepositoryStepData & R)
      const e = validateRepository(d, ctx.snapshot)
      // La conexión externa no bloquea el paso: queda como pending_credentials y se avisa
      delete e.connection
      return e
    },
  },
  email: {
    Component: EmailChannelStep,
    validate: (ctx) => validateEmailStep(ctx.getStepData('email', defaultEmailData as () => EmailStepData & R)),
  },
  whatsapp: {
    Component: WhatsAppChannelStep,
    validate: (ctx) => validateWhatsApp(ctx.getStepData('whatsapp', defaultWhatsAppData as () => WhatsAppStepData & R)),
  },
  sms: {
    Component: SmsChannelStep,
    validate: (ctx) => validateSms(ctx.getStepData('sms', defaultSmsData as () => SmsStepData & R)),
  },
  voice: {
    Component: VoiceChannelStep,
    validate: (ctx) => validateVoice(ctx.getStepData('voice', (() => defaultVoiceData(ctx.snapshot?.empresa.timezone)) as () => VoiceStepData & R)),
  },
  forms: {
    Component: FormsStep,
    validate: (ctx) => {
      const e: FieldErrors = {}
      const templates = ctx.snapshot?.form_templates ?? []
      if (templates.length === 0) e.templates = t('onboarding.forms.atLeastOne')
      else if (!templates.some((x) => x.is_default)) e.templates = t('onboarding.forms.markDefault')
      return e
    },
  },
  automation: {
    Component: AutomationRulesStep,
    validate: (ctx) => (ctx.snapshot ? validateAutomation(ctx.snapshot.automation) : {}),
  },
  billing: {
    Component: BillingSettingsStep,
    validate: (ctx) =>
      ctx.snapshot ? validateBilling(ctx.snapshot.billing, { draft: ibanDraftRef.current, saved: !!ctx.snapshot.empresa.iban_masked }) : {},
  },
  review: {
    Component: ReviewAndActivateStep,
    validate: () => ({}),
  },
}
