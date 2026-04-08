import type { Metadata } from "next";
import { cookies, headers } from 'next/headers';
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import AppProviders from '@/components/providers/AppProviders';
import { LOCALE_COOKIE, MESSAGES, resolveLocale } from '@/lib/i18n';
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get('accept-language'),
  );

  if (locale === 'en') {
    return {
      title: 'Paxl — Visual landing page builder',
      description: 'Build professional landing pages with a visual drag-and-drop editor. No code required.',
    };
  }

  return {
    title: 'Paxl — Editor visual de landing pages',
    description: 'Crea landing pages profesionales con un editor visual drag-and-drop. Sin código.',
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const initialLocale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get('accept-language'),
  );

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('paxl-theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light')}else if(!t&&window.matchMedia('(prefers-color-scheme:light)').matches){document.documentElement.setAttribute('data-theme','light')}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-9999 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium"
        >
          {MESSAGES[initialLocale].navigation.skipToContent}
        </a>
        <AppProviders initialLocale={initialLocale}>{children}</AppProviders>
      </body>
    </html>
  );
}
