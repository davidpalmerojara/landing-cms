import { serverApiUrl } from '@/lib/server-api';

/**
 * Whether this deployment offers custom domains, read on the server (for a
 * page's metadata). When the answer cannot be read the feature counts as off:
 * the page hides it in that case too (useFeatures).
 */
export async function customDomainsEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${serverApiUrl()}/features/`, { next: { revalidate: 60 } });
    if (!res.ok) return false;
    const features: unknown = await res.json();
    return typeof features === 'object' && features !== null && (features as { custom_domains?: unknown }).custom_domains === true;
  } catch (error: unknown) {
    console.error('Could not read the deployment features', error);
    return false;
  }
}
