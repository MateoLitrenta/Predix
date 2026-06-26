import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL('https://zeilo.app'),
  title: 'Zéilo - Mercado de Predicciones',
  description: 'Operá sobre el futuro y ganá puntos. La plataforma global de mercados predictivos.',
  generator: 'v0.app',
}

import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { BottomNav } from "@/components/BottomNav";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                let isDark = true;
                const savedTheme = localStorage.getItem('theme');
                if (savedTheme) {
                  isDark = savedTheme === 'dark';
                } else {
                  isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                }
                if (isDark) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className={`${_geist.className} antialiased`}>
        <ThemeProvider>
          <div className="pb-20 md:pb-0 min-h-screen flex flex-col">
            {children}
          </div>
          <BottomNav />
          <Toaster />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}