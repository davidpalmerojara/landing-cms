import type { Metadata } from "next";
import { cookies, headers } from 'next/headers';
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import AppProviders from '@/components/providers/AppProviders';
import { LOCALE_COOKIE, MESSAGES, resolveLocale } from '@/lib/i18n';
import { pageFontVariables } from '@/lib/page-fonts';
import { SITE_URL } from '@/lib/site-url';
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

  const copy = locale === 'en'
    ? {
      title: 'Paxl — Visual landing page builder',
      description: 'Build professional landing pages with a visual drag-and-drop editor. No code required.',
      imageAlt: 'The Paxl editor with a sample page open',
    }
    : {
      title: 'Paxl — Editor visual de landing pages',
      description: 'Crea landing pages profesionales con un editor visual drag-and-drop. Sin código.',
      imageAlt: 'El editor de Paxl con una página de ejemplo abierta',
    };

  // Shared by every route that does not set its own: the landing is what gets shared
  const image = { url: `/landing/editor-${locale}.webp`, width: 1440, height: 900, alt: copy.imageAlt };

  return {
    metadataBase: new URL(SITE_URL),
    title: copy.title,
    description: copy.description,
    openGraph: {
      type: 'website',
      siteName: 'Paxl',
      locale: locale === 'en' ? 'en_US' : 'es_ES',
      title: copy.title,
      description: copy.description,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.title,
      description: copy.description,
      images: [image.url],
    },
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
        className={`${dmSans.variable} ${jetbrainsMono.variable} ${pageFontVariables} antialiased`}
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
