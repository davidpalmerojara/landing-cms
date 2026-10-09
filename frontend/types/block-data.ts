/**
 * Content (`data`) of every block type. Shapes follow the S8 contract: repeated
 * items are arrays of objects with all their keys present.
 */

export type HeroAlignment = 'center' | 'left';
export type GalleryColumns = '2' | '3' | '4';

export interface FeatureItem { title: string; description: string }
export interface TestimonialItem { quote: string; author: string; role: string }
export interface PricingPlan {
  name: string;
  price: string;
  /** One feature per line */
  features: string;
  buttonText: string;
  buttonLink: string;
  highlighted: boolean;
}
export interface FaqItem { question: string; answer: string }
export interface LogoItem { name: string }
export interface GalleryImage { src: string; alt: string }
export interface TeamMember { name: string; role: string; image: string }
export interface StatItem { value: string; label: string }
export interface TimelineEvent { date: string; title: string; description: string }
export interface LinkItem { label: string; url: string }

export interface HeroData {
  title: string;
  subtitle: string;
  buttonText: string;
  buttonLink: string;
  badgeText: string;
  secondaryButtonText: string;
  secondaryButtonLink: string;
  backgroundImage: string;
  alignment: HeroAlignment;
}

export interface FeaturesData { title: string; features: FeatureItem[] }

export interface TestimonialsData { title: string; testimonials: TestimonialItem[] }

export interface CtaData { title: string; subtitle: string; buttonText: string; buttonLink: string }

export interface FooterData { brandName: string; description: string; copyright: string; links: LinkItem[] }

export interface PricingData {
  title: string;
  subtitle: string;
  billingPeriod: string;
  popularBadgeText: string;
  plans: PricingPlan[];
}

export interface FaqData { title: string; questions: FaqItem[] }

export interface LogoCloudData { title: string; logos: LogoItem[] }

export interface GalleryData { title: string; subtitle: string; columns: GalleryColumns; images: GalleryImage[] }

export interface ContactData {
  title: string;
  subtitle: string;
  buttonText: string;
  namePlaceholder: string;
  emailPlaceholder: string;
  messagePlaceholder: string;
}

export interface CustomHtmlData { html: string }

export interface NavbarData {
  brandName: string;
  logoImage: string;
  links: LinkItem[];
  ctaText: string;
  ctaLink: string;
}

export interface TeamData { title: string; subtitle: string; members: TeamMember[] }

export interface StatsData { title: string; subtitle: string; stats: StatItem[] }

export interface TimelineData { title: string; events: TimelineEvent[] }

/** Block type -> shape of its data. The single list of block types. */
export interface BlockDataMap {
  hero: HeroData;
  features: FeaturesData;
  testimonials: TestimonialsData;
  cta: CtaData;
  footer: FooterData;
  pricing: PricingData;
  faq: FaqData;
  logoCloud: LogoCloudData;
  gallery: GalleryData;
  contact: ContactData;
  customHtml: CustomHtmlData;
  navbar: NavbarData;
  team: TeamData;
  stats: StatsData;
  timeline: TimelineData;
}

export type BlockType = keyof BlockDataMap;

/** Data of any block (union). */
export type BlockData = BlockDataMap[BlockType];

/** Keys of T whose value is V. */
export type KeysOfType<T, V> = { [P in keyof T]-?: T[P] extends V ? P : never }[keyof T] & string;

/** Keys of T that hold a list of items. */
export type ListKeys<T> = { [P in keyof T]-?: T[P] extends readonly object[] ? P : never }[keyof T] & string;

/** Item type of a list. */
export type ItemOf<L> = L extends readonly (infer I)[] ? I : never;

/** Address of a value inside a block's data: ['title'] or ['features', 2, 'title']. */
export type DataPath = readonly (string | number)[];
