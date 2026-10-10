import NotFoundScreen from '@/components/ui/NotFoundScreen';
import { routeMetadata } from '@/lib/route-metadata';

// The tab says "Página no encontrada — Paxl", not the product's home title (APP2-006)
export const generateMetadata = () => routeMetadata('notFound');

export default function NotFound() {
  return <NotFoundScreen />;
}
