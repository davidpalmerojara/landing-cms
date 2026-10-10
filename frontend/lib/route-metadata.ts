import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, MESSAGES, resolveLocale } from '@/lib/i18n';
import type { AppLocale, AppMessages } from '@/lib/i18n';

type RouteKey =
  | 'home' | 'pricing' | 'about' | 'contact' | 'privacy' | 'terms' | 'changelog'
  | 'login' | 'register' | 'dashboard' | 'settings' | 'billing' | 'domains';

interface RouteMeta {
  path: string;
  title: (messages: AppMessages) => string;
  /** Pages behind a login are never indexed */
  private?: boolean;
}

const ROUTES: Record<RouteKey, RouteMeta> = {
  home: { path: '/', title: (m) => m.common.brand },
  pricing: { path: '/pricing', title: (m) => m.marketing.pages.pricing.title },
  about: { path: '/about', title: (m) => m.navigation.about },
  contact: { path: '/contact', title: (m) => m.marketing.pages.contact.title },
  privacy: { path: '/privacy', title: (m) => m.marketing.pages.privacy.title },
  terms: { path: '/terms', title: (m) => m.marketing.pages.terms.title },
  changelog: { path: '/changelog', title: (m) => m.marketing.pages.changelog.title },
  login: { path: '/login', title: (m) => m.auth.login },
  register: { path: '/register', title: (m) => m.auth.register },
  dashboard: { path: '/dashboard', title: (m) => m.dashboard.title, private: true },
  settings: { path: '/settings', title: (m) => m.settingsPage.title, private: true },
  billing: { path: '/settings/billing', title: (m) => m.billing.title, private: true },
  domains: { path: '/settings/domains', title: (m) => m.domains.title, private: true },
};

export async function requestLocale(): Promise<AppLocale> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get('accept-language'));
}

/**
 * Metadata of one route: its own `<title>` ("Precios — Paxl"), in the language
 * of the request, and its canonical path (QA-057). The home page keeps the
 * product title from the root layout.
 */
export async function routeMetadata(route: RouteKey): Promise<Metadata> {
  const meta = ROUTES[route];
  const locale = await requestLocale();
  const metadata: Metadata = { alternates: { canonical: meta.path } };

  if (route !== 'home') {
    const title = `${meta.title(MESSAGES[locale])} — ${MESSAGES[locale].common.brand}`;
    metadata.title = title;
    metadata.openGraph = { title, url: meta.path };
  }
  if (meta.private) metadata.robots = { index: false, follow: false };
  return metadata;
}
