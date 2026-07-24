import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { NextIntlClientProvider } from 'next-intl'
import { routing, SupportedLanguage } from '@/i18n/routing'
import { notFound } from 'next/navigation'
import { Toaster } from 'sonner'
import '../globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap'
})

export const metadata: Metadata = {
  title: 'Halle 400 — Grundrissplaner',
  description: 'Interaktiver 2D-/3D-Grundrissplaner für Halle 400, gemessen aus dem Original-Grundriss.'
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!routing.locales.includes(locale as SupportedLanguage)) {
    notFound()
  }

  setRequestLocale(locale as SupportedLanguage)

  const messages = await getMessages()

  // Das <html> steht hier statt in einem aeusseren Root-Layout (offizielle
  // next-intl-Struktur bei nur EINER Route): nur hier ist die Sprache beim
  // statischen Export bekannt. Im Root-Layout haette lang={locale} `headers`
  // gebraucht -> dynamisches Rendern -> "next build" bricht den Export ab.
  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          {children}
          <Toaster
            position="top-center"
            richColors
            toastOptions={{
              classNames: {
                toast: 'bg-card text-foreground border border-border rounded-lg shadow-lg',
                success: '!bg-card !border-primary !text-primary',
                error: '!bg-card !border-destructive !text-destructive'
              }
            }}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
