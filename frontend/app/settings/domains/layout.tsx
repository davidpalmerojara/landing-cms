import { customDomainsEnabled } from '@/lib/server-features';
import { routeMetadata } from '@/lib/route-metadata';

// The page itself is a client component, which cannot export metadata: its own <title> lives here (QA-057).
// With the feature off the page is a 404, and the tab says so (APP2-006).
export const generateMetadata = async () => routeMetadata((await customDomainsEnabled()) ? 'domains' : 'notFound');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
