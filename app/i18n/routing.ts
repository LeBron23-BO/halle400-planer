import { defineRouting } from 'next-intl/routing'
import { createNavigation } from 'next-intl/navigation'

// Deutsch steht bewusst vorn und ist Standard: der Planer wird fuer Halle 400
// auf Deutsch bedient (T6). Die uebrigen Sprachen bleiben erhalten.
export const locales = ['de', 'en', 'zh', 'tw'] as const
export type SupportedLanguage = (typeof locales)[number]

export const languageMap: Record<SupportedLanguage, string> = {
  de: 'de-DE',
  en: 'en-US',
  zh: 'zh-CN',
  tw: 'zh-TW'
}

export const routing = defineRouting({
  locales,
  defaultLocale: 'de' as SupportedLanguage,
  localePrefix: 'as-needed'
})

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing)
