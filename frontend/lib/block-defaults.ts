/**
 * Sample content of a new block, and of an item added to one of its lists, in
 * each content language. The block registry holds the structure (fields,
 * component); the words live here so the store and the factories can use them
 * without next-intl: callers pass the locale.
 *
 * Kept free of React imports (the registry imports components that import the store).
 */
import type { BlockDataMap, BlockType, ItemOf, ListKeys } from '@/types/block-data';
import { toContentLocale, type ContentLocale } from '@/lib/content-locale';

type BlockDefaults = { [K in BlockType]: BlockDataMap[K] };

/** One new item per list field of every block type. */
type ListItemDefaults = {
  [K in BlockType]: { [P in ListKeys<BlockDataMap[K]>]: ItemOf<BlockDataMap[K][P]> };
};

const blockDefaults: Record<ContentLocale, BlockDefaults> = {
  es: {
    hero: {
      title: 'Tu Nueva Sección',
      subtitle: 'Añade una descripción cautivadora aquí.',
      buttonText: 'Acción Principal',
      buttonLink: '',
      badgeText: 'Nuevo Editor UI',
      secondaryButtonText: 'Saber más',
      secondaryButtonLink: '',
      backgroundImage: '',
      alignment: 'center',
    },
    features: {
      title: 'Descubre las ventajas',
      features: [
        { title: 'Característica 1', description: 'Descripción breve de esta característica increíble.' },
        { title: 'Característica 2', description: 'Descripción breve de esta característica increíble.' },
      ],
    },
    testimonials: {
      title: 'Lo que dicen de nosotros',
      testimonials: [
        {
          quote: 'Este producto ha cambiado por completo la forma en que trabajamos. Simplemente brillante.',
          author: 'María García',
          role: 'Product Manager en TechCorp',
        },
        {
          quote: 'La mejor decisión que tomamos este año. El soporte es increíble y los resultados inmediatos.',
          author: 'Carlos Ruiz',
          role: 'CTO en Startup.io',
        },
      ],
    },
    cta: {
      title: 'Comienza tu viaje',
      subtitle: '',
      buttonText: 'Suscribirse',
      buttonLink: '',
    },
    footer: {
      brandName: 'Acme Corp',
      description: 'Construyendo el futuro de la web, un bloque a la vez. Únete a nuestra revolución digital.',
      copyright: '© 2026 Acme Corporation. Todos los derechos reservados.',
      links: [
        { label: 'Producto', url: '' },
        { label: 'Precios', url: '' },
        { label: 'Contacto', url: '' },
      ],
    },
    pricing: {
      title: 'Planes y precios',
      subtitle: 'Elige el plan que mejor se adapte a tu equipo.',
      billingPeriod: '/mes',
      popularBadgeText: 'Popular',
      plans: [
        {
          name: 'Starter',
          price: '€19',
          features: 'Hasta 5 páginas\n1 dominio custom\nSoporte por email',
          buttonText: 'Empezar gratis',
          buttonLink: '',
          highlighted: false,
        },
        {
          name: 'Pro',
          price: '€49',
          features: 'Páginas ilimitadas\nDominios ilimitados\nSoporte prioritario\nAnalytics avanzado',
          buttonText: 'Elegir Pro',
          buttonLink: '',
          highlighted: true,
        },
      ],
    },
    faq: {
      title: 'Preguntas frecuentes',
      questions: [
        {
          question: '¿Cómo empiezo a usar el producto?',
          answer: 'Regístrate gratis, elige una plantilla y empieza a personalizar tu landing page. No necesitas conocimientos técnicos.',
        },
        {
          question: '¿Puedo usar mi propio dominio?',
          answer: 'Sí, puedes conectar cualquier dominio que poseas. Te guiamos paso a paso en la configuración DNS.',
        },
        {
          question: '¿Ofrecen soporte técnico?',
          answer: 'Todos los planes incluyen soporte por email. Los planes Pro y superiores tienen soporte prioritario con respuesta en menos de 24 horas.',
        },
      ],
    },
    logoCloud: {
      title: 'Empresas que confían en nosotros',
      logos: [
        { name: 'Acme Corp' },
        { name: 'TechFlow' },
        { name: 'DataPrime' },
        { name: 'CloudBase' },
        { name: 'NextWave' },
      ],
    },
    gallery: {
      title: 'Galería',
      subtitle: 'Una muestra de nuestros mejores trabajos.',
      columns: '3',
      images: [
        { src: '', alt: '' },
        { src: '', alt: '' },
        { src: '', alt: '' },
        { src: '', alt: '' },
        { src: '', alt: '' },
        { src: '', alt: '' },
      ],
    },
    contact: {
      title: 'Contacto',
      subtitle: '¿Tienes alguna pregunta? Escríbenos y te responderemos lo antes posible.',
      buttonText: 'Enviar mensaje',
      namePlaceholder: 'Nombre',
      emailPlaceholder: 'Email',
      messagePlaceholder: 'Tu mensaje...',
    },
    customHtml: { html: '' },
    navbar: {
      brandName: 'MiMarca',
      logoImage: '',
      links: [
        { label: 'Producto', url: '' },
        { label: 'Precios', url: '' },
        { label: 'Blog', url: '' },
      ],
      ctaText: 'Empezar',
      ctaLink: '',
    },
    team: {
      title: 'Nuestro equipo',
      subtitle: 'Las personas detrás del producto que estás construyendo.',
      members: [
        { name: 'Ana López', role: 'CEO & Co-fundadora', image: '' },
        { name: 'Carlos Martín', role: 'CTO', image: '' },
        { name: 'Laura García', role: 'Head of Design', image: '' },
      ],
    },
    stats: {
      title: 'Números que hablan',
      subtitle: 'Nuestro impacto en cifras reales.',
      stats: [
        { value: '10K+', label: 'Usuarios activos' },
        { value: '99.9%', label: 'Uptime' },
        { value: '150+', label: 'Países' },
        { value: '4.9/5', label: 'Valoración' },
      ],
    },
    timeline: {
      title: 'Nuestra historia',
      events: [
        {
          date: 'Enero 2024',
          title: 'Fundación',
          description: 'Nace la idea y se forma el equipo fundador con la visión de transformar la industria.',
        },
        {
          date: 'Junio 2024',
          title: 'Lanzamiento beta',
          description: 'Primeros 1.000 usuarios prueban la plataforma y nos ayudan a iterar rápidamente.',
        },
        {
          date: 'Enero 2025',
          title: 'Lanzamiento público',
          description: 'Disponible para todos. Más de 10.000 usuarios en el primer mes.',
        },
      ],
    },
  },
  en: {
    hero: {
      title: 'Your New Section',
      subtitle: 'Add a catchy description here.',
      buttonText: 'Main Action',
      buttonLink: '',
      badgeText: 'New Editor UI',
      secondaryButtonText: 'Learn more',
      secondaryButtonLink: '',
      backgroundImage: '',
      alignment: 'center',
    },
    features: {
      title: 'Discover the benefits',
      features: [
        { title: 'Feature 1', description: 'A short description of this great feature.' },
        { title: 'Feature 2', description: 'A short description of this great feature.' },
      ],
    },
    testimonials: {
      title: 'What people say about us',
      testimonials: [
        {
          quote: 'This product has completely changed the way we work. Simply brilliant.',
          author: 'Emily Carter',
          role: 'Product Manager at TechCorp',
        },
        {
          quote: 'The best decision we made this year. The support is great and the results were immediate.',
          author: 'Daniel Brooks',
          role: 'CTO at Startup.io',
        },
      ],
    },
    cta: {
      title: 'Start your journey',
      subtitle: '',
      buttonText: 'Subscribe',
      buttonLink: '',
    },
    footer: {
      brandName: 'Acme Corp',
      description: 'Building the future of the web, one block at a time. Join our digital revolution.',
      copyright: '© 2026 Acme Corporation. All rights reserved.',
      links: [
        { label: 'Product', url: '' },
        { label: 'Pricing', url: '' },
        { label: 'Contact', url: '' },
      ],
    },
    pricing: {
      title: 'Plans and pricing',
      subtitle: 'Pick the plan that fits your team best.',
      billingPeriod: '/month',
      popularBadgeText: 'Popular',
      plans: [
        {
          name: 'Starter',
          price: '$19',
          features: 'Up to 5 pages\n1 custom domain\nEmail support',
          buttonText: 'Start for free',
          buttonLink: '',
          highlighted: false,
        },
        {
          name: 'Pro',
          price: '$49',
          features: 'Unlimited pages\nUnlimited domains\nPriority support\nAdvanced analytics',
          buttonText: 'Choose Pro',
          buttonLink: '',
          highlighted: true,
        },
      ],
    },
    faq: {
      title: 'Frequently asked questions',
      questions: [
        {
          question: 'How do I get started?',
          answer: 'Sign up for free, pick a template and start customizing your landing page. You do not need any technical knowledge.',
        },
        {
          question: 'Can I use my own domain?',
          answer: 'Yes, you can connect any domain you own. We walk you through the DNS setup step by step.',
        },
        {
          question: 'Do you offer technical support?',
          answer: 'All plans include email support. Pro plans and above get priority support with a reply in under 24 hours.',
        },
      ],
    },
    logoCloud: {
      title: 'Companies that trust us',
      logos: [
        { name: 'Acme Corp' },
        { name: 'TechFlow' },
        { name: 'DataPrime' },
        { name: 'CloudBase' },
        { name: 'NextWave' },
      ],
    },
    gallery: {
      title: 'Gallery',
      subtitle: 'A sample of our best work.',
      columns: '3',
      images: [
        { src: '', alt: '' },
        { src: '', alt: '' },
        { src: '', alt: '' },
        { src: '', alt: '' },
        { src: '', alt: '' },
        { src: '', alt: '' },
      ],
    },
    contact: {
      title: 'Contact',
      subtitle: 'Have a question? Write to us and we will get back to you as soon as we can.',
      buttonText: 'Send message',
      namePlaceholder: 'Name',
      emailPlaceholder: 'Email',
      messagePlaceholder: 'Your message...',
    },
    customHtml: { html: '' },
    navbar: {
      brandName: 'MyBrand',
      logoImage: '',
      links: [
        { label: 'Product', url: '' },
        { label: 'Pricing', url: '' },
        { label: 'Blog', url: '' },
      ],
      ctaText: 'Get started',
      ctaLink: '',
    },
    team: {
      title: 'Our team',
      subtitle: 'The people behind the product you are building.',
      members: [
        { name: 'Anna Lopez', role: 'CEO & Co-founder', image: '' },
        { name: 'Charles Martin', role: 'CTO', image: '' },
        { name: 'Laura Garcia', role: 'Head of Design', image: '' },
      ],
    },
    stats: {
      title: 'Numbers that speak',
      subtitle: 'Our impact in real figures.',
      stats: [
        { value: '10K+', label: 'Active users' },
        { value: '99.9%', label: 'Uptime' },
        { value: '150+', label: 'Countries' },
        { value: '4.9/5', label: 'Rating' },
      ],
    },
    timeline: {
      title: 'Our story',
      events: [
        {
          date: 'January 2024',
          title: 'Foundation',
          description: 'The idea is born and the founding team forms, with a vision to transform the industry.',
        },
        {
          date: 'June 2024',
          title: 'Beta launch',
          description: 'The first 1,000 users try the platform and help us iterate quickly.',
        },
        {
          date: 'January 2025',
          title: 'Public launch',
          description: 'Available to everyone. More than 10,000 users in the first month.',
        },
      ],
    },
  },
};

const listItemDefaults: Record<ContentLocale, ListItemDefaults> = {
  es: {
    hero: {},
    features: { features: { title: 'Nueva característica', description: 'Descripción breve de esta característica.' } },
    testimonials: {
      testimonials: { quote: 'Escribe aquí lo que dice tu cliente.', author: 'Nombre', role: 'Cargo en Empresa' },
    },
    cta: {},
    footer: { links: { label: 'Nuevo enlace', url: '' } },
    pricing: {
      plans: {
        name: 'Nuevo plan',
        price: '€99',
        features: 'Característica 1\nCaracterística 2',
        buttonText: 'Elegir plan',
        buttonLink: '',
        highlighted: false,
      },
    },
    faq: { questions: { question: 'Nueva pregunta', answer: 'Escribe aquí la respuesta.' } },
    logoCloud: { logos: { name: 'Nueva empresa' } },
    gallery: { images: { src: '', alt: '' } },
    contact: {},
    customHtml: {},
    navbar: { links: { label: 'Nuevo enlace', url: '' } },
    team: { members: { name: 'Nuevo miembro', role: 'Rol', image: '' } },
    stats: { stats: { value: '100+', label: 'Nueva cifra' } },
    timeline: { events: { date: 'Fecha', title: 'Nuevo evento', description: 'Describe lo que pasó.' } },
  },
  en: {
    hero: {},
    features: { features: { title: 'New feature', description: 'A short description of this feature.' } },
    testimonials: {
      testimonials: { quote: 'Write what your customer says here.', author: 'Name', role: 'Role at Company' },
    },
    cta: {},
    footer: { links: { label: 'New link', url: '' } },
    pricing: {
      plans: {
        name: 'New plan',
        price: '$99',
        features: 'Feature 1\nFeature 2',
        buttonText: 'Choose plan',
        buttonLink: '',
        highlighted: false,
      },
    },
    faq: { questions: { question: 'New question', answer: 'Write the answer here.' } },
    logoCloud: { logos: { name: 'New company' } },
    gallery: { images: { src: '', alt: '' } },
    contact: {},
    customHtml: {},
    navbar: { links: { label: 'New link', url: '' } },
    team: { members: { name: 'New member', role: 'Role', image: '' } },
    stats: { stats: { value: '100+', label: 'New stat' } },
    timeline: { events: { date: 'Date', title: 'New event', description: 'Describe what happened.' } },
  },
};

/** Sample content for a new block of `type`. A fresh copy: callers may keep and change it. */
export function getBlockDefaults<K extends BlockType>(type: K, locale: string | null | undefined): BlockDataMap[K] {
  return structuredClone(blockDefaults[toContentLocale(locale)][type]);
}

/** Content of an item added to list `key` of a block, or null when `key` is not a list of `type`. */
export function getNewListItem(type: BlockType, key: string, locale: string | null | undefined): object | null {
  const items: Record<string, object> = listItemDefaults[toContentLocale(locale)][type];
  return Object.prototype.hasOwnProperty.call(items, key) ? structuredClone(items[key]) : null;
}
