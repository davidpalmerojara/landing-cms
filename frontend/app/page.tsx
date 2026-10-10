import LandingPage from '@/components/marketing/LandingPage';
import { routeMetadata } from '@/lib/route-metadata';

// The title, description and social tags come from the root layout; the home page adds its canonical address
export const generateMetadata = () => routeMetadata('home');

export default function HomePage() {
  return <LandingPage />;
}
