import type { TemplateBlock, TemplateDefinition } from '@/lib/templates';

const es: TemplateBlock[] = [
  {
    type: 'navbar',
    data: {
      brandName: 'DataSync',
      logoImage: '',
      links: [
        { label: 'Características', url: '#features' },
        { label: 'Precios', url: '#pricing' },
        { label: 'FAQ', url: '#faq' },
      ],
      ctaText: 'Empezar gratis',
      ctaLink: '#pricing',
    },
  },
  {
    type: 'hero',
    data: {
      title: 'Sincroniza tus datos en tiempo real',
      subtitle: 'La plataforma definitiva para conectar tus bases de datos sin escribir código de integración complejo.',
      buttonText: 'Comenzar prueba de 14 días',
      backgroundImage: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=80',
    },
  },
  {
    type: 'stats',
    data: {
      title: 'Escala sin límites',
      subtitle: 'Diseñado para el rendimiento extremo de las empresas más exigentes.',
      stats: [
        { value: '99.9%', label: 'Uptime garantizado' },
        { value: '50M+', label: 'Eventos diarios' },
        { value: '<10ms', label: 'Latencia media' },
        { value: '24/7', label: 'Soporte técnico' },
      ],
    },
  },
  {
    type: 'features',
    data: {
      title: 'Todo lo que necesitas para escalar',
      features: [
        {
          title: 'Conexión instantánea',
          description: 'Conecta con más de 50 herramientas y plataformas SaaS en menos de 2 minutos mediante nuestra API unificada.',
        },
        {
          title: 'Seguridad de grado bancario',
          description: 'Cifrado end-to-end, cumplimiento SOC2 y GDPR desde el primer día para mantener tus datos a salvo.',
        },
      ],
    },
  },
  {
    type: 'logoCloud',
    data: {
      title: 'Empresas que confían en DataSync',
      logos: [
        { name: 'TechFlow' },
        { name: 'CloudBase' },
        { name: 'NextWave' },
        { name: 'DataPrime' },
        { name: 'Infranet' },
      ],
    },
  },
  {
    type: 'testimonials',
    data: {
      title: 'Amado por equipos de ingeniería',
      testimonials: [
        {
          quote: 'Integrar DataSync nos ahorró meses de desarrollo interno. Es magia pura y funciona sin problemas.',
          author: 'Elena Torres',
          role: 'Lead Engineer en TechFlow',
        },
        {
          quote: 'Nunca había visto una sincronización tan rápida. Nuestro equipo ahora puede centrarse en el producto core.',
          author: 'Carlos Gómez',
          role: 'CTO en Startup.io',
        },
      ],
    },
  },
  {
    type: 'pricing',
    data: {
      title: 'Precios simples y transparentes',
      subtitle: 'Escala tu infraestructura sin sorpresas en tu factura mensual.',
      plans: [
        {
          name: 'Starter',
          price: '$29',
          features: '100k eventos/mes\nSoporte por email\n3 integraciones',
          buttonText: 'Elegir Starter',
          buttonLink: '',
          highlighted: false,
        },
        {
          name: 'Pro',
          price: '$99',
          features: 'Eventos ilimitados\nSoporte prioritario 24/7\nIntegraciones ilimitadas',
          buttonText: 'Empezar prueba Pro',
          buttonLink: '',
          highlighted: true,
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
          question: '¿Tienen prueba gratuita?',
          answer: 'Sí, ofrecemos 14 días de prueba con acceso a todas las funcionalidades del plan Pro, sin requerir tarjeta de crédito.',
        },
        {
          question: '¿Puedo cancelar en cualquier momento?',
          answer: 'Absolutamente. No hay contratos a largo plazo y puedes cancelar tu suscripción con un solo clic en tu panel.',
        },
        {
          question: '¿Ofrecen descuentos para startups?',
          answer: 'Sí, tenemos un programa especial para startups en etapas tempranas. Contáctanos en el soporte para más detalles.',
        },
      ],
    },
  },
  {
    type: 'cta',
    data: {
      title: '¿Listo para transformar tu infraestructura?',
      buttonText: 'Crear cuenta gratuita hoy',
    },
  },
  {
    type: 'footer',
    data: {
      brandName: 'DataSync',
      description: 'Infraestructura de datos robusta para equipos ágiles e innovadores.',
      links: [
        { label: 'Documentación', url: '' },
        { label: 'Términos', url: '' },
        { label: 'Privacidad', url: '' },
      ],
      copyright: '© 2026 DataSync Inc. Todos los derechos reservados.',
    },
  },
];

const en: TemplateBlock[] = [
  {
    type: 'navbar',
    data: {
      brandName: 'DataSync',
      logoImage: '',
      links: [
        { label: 'Features', url: '#features' },
        { label: 'Pricing', url: '#pricing' },
        { label: 'FAQ', url: '#faq' },
      ],
      ctaText: 'Start for free',
      ctaLink: '#pricing',
    },
  },
  {
    type: 'hero',
    data: {
      title: 'Sync your data in real time',
      subtitle: 'The platform for connecting your databases without writing complex integration code.',
      buttonText: 'Start your 14-day trial',
      backgroundImage: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=80',
    },
  },
  {
    type: 'stats',
    data: {
      title: 'Scale without limits',
      subtitle: 'Built for the extreme performance demands of the most exacting companies.',
      stats: [
        { value: '99.9%', label: 'Guaranteed uptime' },
        { value: '50M+', label: 'Daily events' },
        { value: '<10ms', label: 'Average latency' },
        { value: '24/7', label: 'Technical support' },
      ],
    },
  },
  {
    type: 'features',
    data: {
      title: 'Everything you need to scale',
      features: [
        {
          title: 'Instant connection',
          description: 'Connect with more than 50 SaaS tools and platforms in under 2 minutes through our unified API.',
        },
        {
          title: 'Bank-grade security',
          description: 'End-to-end encryption, SOC2 and GDPR compliance from day one to keep your data safe.',
        },
      ],
    },
  },
  {
    type: 'logoCloud',
    data: {
      title: 'Companies that trust DataSync',
      logos: [
        { name: 'TechFlow' },
        { name: 'CloudBase' },
        { name: 'NextWave' },
        { name: 'DataPrime' },
        { name: 'Infranet' },
      ],
    },
  },
  {
    type: 'testimonials',
    data: {
      title: 'Loved by engineering teams',
      testimonials: [
        {
          quote: 'Integrating DataSync saved us months of in-house development. It feels like magic and it just works.',
          author: 'Elena Torres',
          role: 'Lead Engineer at TechFlow',
        },
        {
          quote: 'I have never seen a sync this fast. Our team can now focus on the core product.',
          author: 'Carl Gomez',
          role: 'CTO at Startup.io',
        },
      ],
    },
  },
  {
    type: 'pricing',
    data: {
      title: 'Simple, transparent pricing',
      subtitle: 'Scale your infrastructure without surprises on your monthly bill.',
      plans: [
        {
          name: 'Starter',
          price: '$29',
          features: '100k events/month\nEmail support\n3 integrations',
          buttonText: 'Choose Starter',
          buttonLink: '',
          highlighted: false,
        },
        {
          name: 'Pro',
          price: '$99',
          features: 'Unlimited events\n24/7 priority support\nUnlimited integrations',
          buttonText: 'Start Pro trial',
          buttonLink: '',
          highlighted: true,
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
          question: 'Do you have a free trial?',
          answer: 'Yes, we offer 14 days with access to every feature of the Pro plan, no credit card required.',
        },
        {
          question: 'Can I cancel at any time?',
          answer: 'Absolutely. There are no long-term contracts and you can cancel your subscription with one click in your dashboard.',
        },
        {
          question: 'Do you offer discounts for startups?',
          answer: 'Yes, we have a special program for early-stage startups. Contact support for more details.',
        },
      ],
    },
  },
  {
    type: 'cta',
    data: {
      title: 'Ready to transform your infrastructure?',
      buttonText: 'Create a free account today',
    },
  },
  {
    type: 'footer',
    data: {
      brandName: 'DataSync',
      description: 'Robust data infrastructure for agile, innovative teams.',
      links: [
        { label: 'Documentation', url: '' },
        { label: 'Terms', url: '' },
        { label: 'Privacy', url: '' },
      ],
      copyright: '© 2026 DataSync Inc. All rights reserved.',
    },
  },
];

export const saasLanding: TemplateDefinition = {
  id: 'saas-landing',
  presetId: 'dark',
  content: {
    es: {
      name: 'SaaS Landing',
      description: 'Página de producto SaaS con hero, stats, features, testimonios, pricing, FAQ y CTA.',
      category: 'Negocio',
      blocks: es,
    },
    en: {
      name: 'SaaS Landing',
      description: 'SaaS product page with a hero, stats, features, testimonials, pricing, FAQ and CTA.',
      category: 'Business',
      blocks: en,
    },
  },
};
