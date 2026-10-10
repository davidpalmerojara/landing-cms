import type { TemplateBlock, TemplateDefinition } from '@/lib/templates';

const es: TemplateBlock[] = [
  {
    type: 'navbar',
    data: {
      brandName: 'Studio.Design',
      logoImage: '',
      links: [
        { label: 'Trabajos', url: '#gallery' },
        { label: 'Servicios', url: '#features' },
        { label: 'Sobre mí', url: '' },
      ],
      ctaText: 'Hablemos',
      ctaLink: '#cta',
    },
  },
  {
    type: 'hero',
    data: {
      title: 'Diseño digital que deja huella.',
      subtitle: 'Soy [Tu Nombre], Product Designer especializado en crear experiencias de usuario que enamoran y convierten.',
      buttonText: 'Ver mis proyectos',
      backgroundImage: '',
      alignment: 'left',
    },
  },
  {
    type: 'gallery',
    data: {
      title: 'Proyectos Destacados',
      subtitle: 'Una selección de mis trabajos recientes en UI/UX y Branding.',
      columns: '2',
      images: [
        { src: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1559028012-481c04fa702d?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1586717791821-3f44a563fa4c?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&q=80', alt: '' },
      ],
    },
  },
  {
    type: 'features',
    data: {
      title: 'Cómo puedo ayudarte',
      features: [
        {
          title: 'Diseño de Producto (UI/UX)',
          description: 'Desde la conceptualización hasta los prototipos finales en Figma, creando interfaces intuitivas y accesibles.',
        },
        {
          title: 'Estrategia de Marca',
          description: 'Desarrollo de identidades visuales sólidas que conectan emocionalmente con tu audiencia objetivo.',
        },
      ],
    },
  },
  {
    type: 'testimonials',
    data: {
      title: 'Lo que dicen mis clientes',
      testimonials: [
        {
          quote: 'Transformó completamente nuestra aplicación. La retención de usuarios aumentó un 40% en el primer mes tras el rediseño.',
          author: 'Laura Méndez',
          role: 'Founder en FinTech Plus',
        },
        {
          quote: 'Trabajar con él fue un proceso fluido. Supo captar la esencia de nuestra marca desde el primer boceto.',
          author: 'David Costa',
          role: 'Director de Marketing en StudioX',
        },
      ],
    },
  },
  {
    type: 'cta',
    data: {
      title: 'Creemos algo increíble juntos',
      subtitle: 'Estoy disponible para nuevos proyectos y colaboraciones freelance.',
      buttonText: 'Enviar mensaje',
    },
  },
  {
    type: 'footer',
    data: {
      brandName: 'Studio.Design',
      description: 'Product Designer & UI Developer afincado en Madrid.',
      links: [
        { label: 'Dribbble', url: '' },
        { label: 'LinkedIn', url: '' },
        { label: 'Twitter', url: '' },
      ],
      copyright: '© 2026 Studio Design. Creado con pasión.',
    },
  },
];

const en: TemplateBlock[] = [
  {
    type: 'navbar',
    data: {
      brandName: 'Studio.Design',
      logoImage: '',
      links: [
        { label: 'Work', url: '#gallery' },
        { label: 'Services', url: '#features' },
        { label: 'About me', url: '' },
      ],
      ctaText: 'Get in touch',
      ctaLink: '#cta',
    },
  },
  {
    type: 'hero',
    data: {
      title: 'Digital design that leaves a mark.',
      subtitle: 'I am [Your Name], a Product Designer who creates user experiences people love and that convert.',
      buttonText: 'See my projects',
      backgroundImage: '',
      alignment: 'left',
    },
  },
  {
    type: 'gallery',
    data: {
      title: 'Featured projects',
      subtitle: 'A selection of my recent work in UI/UX and branding.',
      columns: '2',
      images: [
        { src: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1559028012-481c04fa702d?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1586717791821-3f44a563fa4c?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&q=80', alt: '' },
      ],
    },
  },
  {
    type: 'features',
    data: {
      title: 'How I can help',
      features: [
        {
          title: 'Product design (UI/UX)',
          description: 'From concept to final prototypes in Figma, creating interfaces that are intuitive and accessible.',
        },
        {
          title: 'Brand strategy',
          description: 'Building solid visual identities that connect emotionally with your target audience.',
        },
      ],
    },
  },
  {
    type: 'testimonials',
    data: {
      title: 'What my clients say',
      testimonials: [
        {
          quote: 'The redesign transformed our app. User retention went up 40% in the first month.',
          author: 'Laura Mendez',
          role: 'Founder at FinTech Plus',
        },
        {
          quote: 'Working together was a smooth process. The essence of our brand was captured from the very first sketch.',
          author: 'David Costa',
          role: 'Marketing Director at StudioX',
        },
      ],
    },
  },
  {
    type: 'cta',
    data: {
      title: 'Let\'s create something great together',
      subtitle: 'I am available for new projects and freelance collaborations.',
      buttonText: 'Send a message',
    },
  },
  {
    type: 'footer',
    data: {
      brandName: 'Studio.Design',
      description: 'Product Designer & UI Developer based in Madrid.',
      links: [
        { label: 'Dribbble', url: '' },
        { label: 'LinkedIn', url: '' },
        { label: 'Twitter', url: '' },
      ],
      copyright: '© 2026 Studio Design. Made with care.',
    },
  },
];

export const portfolio: TemplateDefinition = {
  id: 'portfolio',
  presetId: 'slate',
  content: {
    es: {
      name: 'Portfolio',
      description: 'Portafolio personal de diseñador con proyectos, servicios, testimonios y contacto.',
      category: 'Creativo',
      blocks: es,
    },
    en: {
      name: 'Portfolio',
      description: 'Personal portfolio for a designer, with projects, services, testimonials and contact.',
      category: 'Creative',
      blocks: en,
    },
  },
};
