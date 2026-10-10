import { routeMetadata } from '@/lib/route-metadata';

// The page itself is a client component, which cannot export metadata: its own <title> lives here (QA-057)
export const generateMetadata = () => routeMetadata('privacy');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
