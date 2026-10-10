import type { TemplateBlock, TemplateDefinition } from '@/lib/templates';

const es: TemplateBlock[] = [
  {
    type: 'hero',
    data: {
      title: 'Algo increíble está en camino',
      subtitle: 'Estamos construyendo algo que va a cambiar las reglas del juego. Sé el primero en enterarte.',
      buttonText: 'Notificarme al lanzamiento',
      backgroundImage: 'https://images.unsplash.com/photo-1534996858221-380b92700493?w=1920&q=80',
    },
  },
  {
    type: 'features',
    data: {
      title: '¿Qué estamos construyendo?',
      features: [
        {
          title: 'Innovación real',
          description: 'No es otro producto más. Estamos resolviendo un problema que nadie ha abordado de esta manera.',
        },
        {
          title: 'Acceso anticipado',
          description: 'Los primeros suscriptores tendrán acceso exclusivo antes del lanzamiento público y precio especial de por vida.',
        },
      ],
    },
  },
  {
    type: 'timeline',
    data: {
      title: 'Roadmap de lanzamiento',
      events: [
        {
          date: 'Q1 2026',
          title: 'Beta cerrada',
          description: 'Acceso exclusivo para los primeros 500 suscriptores de la lista de espera.',
        },
        {
          date: 'Q2 2026',
          title: 'Beta pública',
          description: 'Abrimos las puertas al público con un plan gratuito generoso.',
        },
        {
          date: 'Q3 2026',
          title: 'Lanzamiento oficial',
          description: 'Versión 1.0 con todas las funcionalidades y planes de pago disponibles.',
        },
      ],
    },
  },
  {
    type: 'faq',
    data: {
      title: 'Preguntas frecuentes',
      questions: [
        {
          question: '¿Cuándo será el lanzamiento?',
          answer: 'Estamos en fase de desarrollo activo. El lanzamiento público está previsto para Q2 2026.',
        },
        {
          question: '¿Es gratuito?',
          answer: 'Habrá un plan gratuito generoso y planes de pago para equipos más grandes.',
        },
        {
          question: '¿Cómo me apunto a la beta?',
          answer: 'Déjanos tu email y serás de los primeros en probar la plataforma cuando esté lista.',
        },
      ],
    },
  },
  {
    type: 'cta',
    data: {
      title: 'No te lo pierdas',
      buttonText: 'Unirme a la lista de espera',
    },
  },
  {
    type: 'footer',
    data: {
      brandName: 'NuevoProducto',
      description: 'Próximamente. Algo grande se está cocinando.',
      links: [
        { label: 'Twitter', url: '' },
        { label: 'Blog', url: '' },
        { label: 'Contacto', url: '' },
      ],
      copyright: '© 2026 NuevoProducto. Todos los derechos reservados.',
    },
  },
];

const en: TemplateBlock[] = [
  {
    type: 'hero',
    data: {
      title: 'Something amazing is on its way',
      subtitle: 'We are building something that will change the rules of the game. Be the first to know.',
      buttonText: 'Notify me at launch',
      backgroundImage: 'https://images.unsplash.com/photo-1534996858221-380b92700493?w=1920&q=80',
    },
  },
  {
    type: 'features',
    data: {
      title: 'What are we building?',
      features: [
        {
          title: 'Real innovation',
          description: 'This is not just another product. We are solving a problem nobody has approached this way before.',
        },
        {
          title: 'Early access',
          description: 'The first subscribers get exclusive access before the public launch, and a special price for life.',
        },
      ],
    },
  },
  {
    type: 'timeline',
    data: {
      title: 'Launch roadmap',
      events: [
        {
          date: 'Q1 2026',
          title: 'Closed beta',
          description: 'Exclusive access for the first 500 subscribers on the waitlist.',
        },
        {
          date: 'Q2 2026',
          title: 'Public beta',
          description: 'We open the doors to everyone with a generous free plan.',
        },
        {
          date: 'Q3 2026',
          title: 'Official launch',
          description: 'Version 1.0 with every feature and paid plans available.',
        },
      ],
    },
  },
  {
    type: 'faq',
    data: {
      title: 'Frequently asked questions',
      questions: [
        {
          question: 'When is the launch?',
          answer: 'We are in active development. The public launch is planned for Q2 2026.',
        },
        {
          question: 'Is it free?',
          answer: 'There will be a generous free plan and paid plans for larger teams.',
        },
        {
          question: 'How do I join the beta?',
          answer: 'Leave us your email and you will be among the first to try the platform when it is ready.',
        },
      ],
    },
  },
  {
    type: 'cta',
    data: {
      title: 'Do not miss it',
      buttonText: 'Join the waitlist',
    },
  },
  {
    type: 'footer',
    data: {
      brandName: 'NewProduct',
      description: 'Coming soon. Something big is cooking.',
      links: [
        { label: 'Twitter', url: '' },
        { label: 'Blog', url: '' },
        { label: 'Contact', url: '' },
      ],
      copyright: '© 2026 NewProduct. All rights reserved.',
    },
  },
];

export const comingSoon: TemplateDefinition = {
  id: 'coming-soon',
  presetId: 'dark',
  content: {
    es: {
      name: 'Coming Soon',
      description: 'Página de prelanzamiento con hero impactante, adelanto de features y lista de espera.',
      category: 'Lanzamiento',
      blocks: es,
    },
    en: {
      name: 'Coming Soon',
      description: 'Pre-launch page with a bold hero, a preview of the features and a waitlist.',
      category: 'Launch',
      blocks: en,
    },
  },
};
