import { routeMetadata } from '@/lib/route-metadata';

// The page itself is a client component, which cannot export metadata: its own <title> lives here (APP2-006)
export const generateMetadata = () => routeMetadata('magic');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
