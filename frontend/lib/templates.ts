import { defaultBlockStyles } from '@/types/blocks';
import type { Block } from '@/types/blocks';

function generateId(prefix = 'blk') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  themeId: string;
  category: string;
  /** Block types in order; each can override data and styles */
  blocks: Array<{
    type: string;
    data: Record<string, unknown>;
    styles?: Partial<typeof defaultBlockStyles>;
  }>;
}

/** Instantiate a template's blocks with unique IDs */
export function instantiateTemplate(template: PageTemplate): {
  blocks: Block[];
  themeId: string;
  name: string;
} {
  const blocks: Block[] = template.blocks.map((def) => ({
    id: generateId(),
    type: def.type,
    name: def.type,
    data: { ...def.data },
    styles: { ...defaultBlockStyles, ...def.styles },
  }));
  return { blocks, themeId: template.themeId, name: template.name };
}

// ─── Template definitions ────────────────────────────────────────
// Field keys must match blockRegistry[type].initialData exactly.

export const pageTemplates: PageTemplate[] = [
  // ── 1. SaaS Landing ─────────────────────────────────────────
  {
    id: 'saas-landing',
    name: 'SaaS Landing',
    description: 'Página de producto SaaS con hero, stats, features, testimonios, pricing, FAQ y CTA.',
    themeId: 'dark',
    category: 'Negocio',
    blocks: [
      {
        type: 'navbar',
        data: {
          brandName: 'DataSync',
          logoImage: '',
          link1: 'Características',
          link2: 'Precios',
          link3: 'FAQ',
          ctaText: 'Empezar gratis',
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
          stat1Value: '99.9%',
          stat1Label: 'Uptime garantizado',
          stat2Value: '50M+',
          stat2Label: 'Eventos diarios',
          stat3Value: '<10ms',
          stat3Label: 'Latencia media',
          stat4Value: '24/7',
          stat4Label: 'Soporte técnico',
        },
      },
      {
        type: 'features',
        data: {
          title: 'Todo lo que necesitas para escalar',
          feature1Title: 'Conexión instantánea',
          feature1Desc: 'Conecta con más de 50 herramientas y plataformas SaaS en menos de 2 minutos mediante nuestra API unificada.',
          feature2Title: 'Seguridad de grado bancario',
          feature2Desc: 'Cifrado end-to-end, cumplimiento SOC2 y GDPR desde el primer día para mantener tus datos a salvo.',
        },
      },
      {
        type: 'logoCloud',
        data: {
          title: 'Empresas que confían en DataSync',
          logo1: 'TechFlow',
          logo2: 'CloudBase',
          logo3: 'NextWave',
          logo4: 'DataPrime',
          logo5: 'Infranet',
        },
      },
      {
        type: 'testimonials',
        data: {
          title: 'Amado por equipos de ingeniería',
          quote1: 'Integrar DataSync nos ahorró meses de desarrollo interno. Es magia pura y funciona sin problemas.',
          author1: 'Elena Torres',
          role1: 'Lead Engineer en TechFlow',
          quote2: 'Nunca había visto una sincronización tan rápida. Nuestro equipo ahora puede centrarse en el producto core.',
          author2: 'Carlos Gómez',
          role2: 'CTO en Startup.io',
        },
      },
      {
        type: 'pricing',
        data: {
          title: 'Precios simples y transparentes',
          subtitle: 'Escala tu infraestructura sin sorpresas en tu factura mensual.',
          plan1Name: 'Starter',
          plan1Price: '$29',
          plan1Features: '100k eventos/mes\nSoporte por email\n3 integraciones',
          plan1ButtonText: 'Elegir Starter',
          plan2Name: 'Pro',
          plan2Price: '$99',
          plan2Features: 'Eventos ilimitados\nSoporte prioritario 24/7\nIntegraciones ilimitadas',
          plan2ButtonText: 'Empezar prueba Pro',
          plan2Highlighted: true,
        },
      },
      {
        type: 'faq',
        data: {
          title: 'Preguntas frecuentes',
          q1: '¿Tienen prueba gratuita?',
          a1: 'Sí, ofrecemos 14 días de prueba con acceso a todas las funcionalidades del plan Pro, sin requerir tarjeta de crédito.',
          q2: '¿Puedo cancelar en cualquier momento?',
          a2: 'Absolutamente. No hay contratos a largo plazo y puedes cancelar tu suscripción con un solo clic en tu panel.',
          q3: '¿Ofrecen descuentos para startups?',
          a3: 'Sí, tenemos un programa especial para startups en etapas tempranas. Contáctanos en el soporte para más detalles.',
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
          link1Label: 'Documentación',
          link2Label: 'Términos',
          link3Label: 'Privacidad',
          copyright: '© 2026 DataSync Inc. Todos los derechos reservados.',
        },
      },
    ],
  },

  // ── 2. Portfolio ────────────────────────────────────────────
  // Basado en docs/mockup-template2.tsx
  {
    id: 'portfolio',
    name: 'Portfolio',
    description: 'Portafolio personal de diseñador con proyectos, servicios, testimonios y contacto.',
    themeId: 'slate',
    category: 'Creativo',
    blocks: [
      {
        type: 'navbar',
        data: {
          brandName: 'Studio.Design',
          logoImage: '',
          link1: 'Trabajos',
          link2: 'Servicios',
          link3: 'Sobre mí',
          ctaText: 'Hablemos',
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
          image1: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80',
          image2: 'https://images.unsplash.com/photo-1559028012-481c04fa702d?w=800&q=80',
          image3: 'https://images.unsplash.com/photo-1586717791821-3f44a563fa4c?w=800&q=80',
          image4: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&q=80',
        },
      },
      {
        type: 'features',
        data: {
          title: 'Cómo puedo ayudarte',
          feature1Title: 'Diseño de Producto (UI/UX)',
          feature1Desc: 'Desde la conceptualización hasta los prototipos finales en Figma, creando interfaces intuitivas y accesibles.',
          feature2Title: 'Estrategia de Marca',
          feature2Desc: 'Desarrollo de identidades visuales sólidas que conectan emocionalmente con tu audiencia objetivo.',
        },
      },
      {
        type: 'testimonials',
        data: {
          title: 'Lo que dicen mis clientes',
          quote1: 'Transformó completamente nuestra aplicación. La retención de usuarios aumentó un 40% en el primer mes tras el rediseño.',
          author1: 'Laura Méndez',
          role1: 'Founder en FinTech Plus',
          quote2: 'Trabajar con él fue un proceso fluido. Supo captar la esencia de nuestra marca desde el primer boceto.',
          author2: 'David Costa',
          role2: 'Director de Marketing en StudioX',
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
          link1Label: 'Dribbble',
          link2Label: 'LinkedIn',
          link3Label: 'Twitter',
          copyright: '© 2026 Studio Design. Creado con pasión.',
        },
      },
    ],
  },

  // ── 3. Restaurante ─────────────────────────────────────────
  // Basado en docs/mockup-template3.tsx
  {
    id: 'restaurant',
    name: 'Restaurante',
    description: 'Landing para restaurante de brasa con galería de platos, testimonios, ubicación y reservas.',
    themeId: 'ember',
    category: 'Gastronomía',
    blocks: [
      {
        type: 'navbar',
        data: {
          brandName: 'La Brasa',
          logoImage: '',
          link1: 'El Menú',
          link2: 'Nuestra Historia',
          link3: 'Ubicación',
          ctaText: 'Reservar Mesa',
        },
      },
      {
        type: 'hero',
        data: {
          title: 'Sabor auténtico en cada bocado.',
          subtitle: 'Carnes a la brasa y cocina de autor en el corazón de la ciudad. Una experiencia gastronómica inolvidable.',
          buttonText: 'Ver el menú',
          backgroundImage: '',
        },
      },
      {
        type: 'features',
        data: {
          title: 'Nuestra esencia',
          feature1Title: 'Ingredientes de proximidad',
          feature1Desc: 'Trabajamos exclusivamente con productores locales para garantizar la máxima frescura y calidad en cada plato.',
          feature2Title: 'Horno de leña tradicional',
          feature2Desc: 'Nuestras carnes y verduras se preparan lentamente en nuestro horno de leña, dándoles ese sabor ahumado inconfundible.',
        },
      },
      {
        type: 'gallery',
        data: {
          title: 'Nuestros platos estrella',
          subtitle: 'Un vistazo a lo que te espera en La Brasa.',
          columns: '3',
          image1: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80',
          image2: 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80',
          image3: 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=800&q=80',
          image4: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80',
          image5: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80',
          image6: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80',
        },
      },
      {
        type: 'testimonials',
        data: {
          title: 'Reseñas de nuestros comensales',
          quote1: 'El mejor chuletón que he probado en mi vida. El ambiente es acogedor y el servicio impecable. Repetiremos seguro.',
          author1: 'Javier M.',
          role1: 'Guía Local de Google',
          quote2: 'Increíble experiencia. Los entrantes son muy originales y los postres caseros son el broche de oro perfecto.',
          author2: 'Sofía R.',
          role2: 'Cliente habitual',
        },
      },
      {
        type: 'cta',
        data: {
          title: 'Ven a visitarnos',
          subtitle: 'Calle Mayor 45, Centro Histórico. Abierto de Martes a Domingo.',
          buttonText: 'Haz tu reserva',
        },
      },
      {
        type: 'footer',
        data: {
          brandName: 'La Brasa',
          description: 'Cocina de brasa contemporánea. Donde el fuego y el sabor se encuentran.',
          link1Label: 'Instagram',
          link2Label: 'TripAdvisor',
          link3Label: 'Aviso Legal',
          copyright: '© 2026 La Brasa. Todos los derechos reservados.',
        },
      },
    ],
  },

  // ── 4. Coming Soon ──────────────────────────────────────────
  {
    id: 'coming-soon',
    name: 'Coming Soon',
    description: 'Página de prelanzamiento con hero impactante, adelanto de features y lista de espera.',
    themeId: 'dark',
    category: 'Lanzamiento',
    blocks: [
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
          feature1Title: 'Innovación real',
          feature1Desc: 'No es otro producto más. Estamos resolviendo un problema que nadie ha abordado de esta manera.',
          feature2Title: 'Acceso anticipado',
          feature2Desc: 'Los primeros suscriptores tendrán acceso exclusivo antes del lanzamiento público y precio especial de por vida.',
        },
      },
      {
        type: 'timeline',
        data: {
          title: 'Roadmap de lanzamiento',
          item1Date: 'Q1 2026',
          item1Title: 'Beta cerrada',
          item1Desc: 'Acceso exclusivo para los primeros 500 suscriptores de la lista de espera.',
          item2Date: 'Q2 2026',
          item2Title: 'Beta pública',
          item2Desc: 'Abrimos las puertas al público con un plan gratuito generoso.',
          item3Date: 'Q3 2026',
          item3Title: 'Lanzamiento oficial',
          item3Desc: 'Versión 1.0 con todas las funcionalidades y planes de pago disponibles.',
        },
      },
      {
        type: 'faq',
        data: {
          title: 'Preguntas frecuentes',
          q1: '¿Cuándo será el lanzamiento?',
          a1: 'Estamos en fase de desarrollo activo. El lanzamiento público está previsto para Q2 2026.',
          q2: '¿Es gratuito?',
          a2: 'Habrá un plan gratuito generoso y planes de pago para equipos más grandes.',
          q3: '¿Cómo me apunto a la beta?',
          a3: 'Déjanos tu email y serás de los primeros en probar la plataforma cuando esté lista.',
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
          link1Label: 'Twitter',
          link2Label: 'Blog',
          link3Label: 'Contacto',
          copyright: '© 2026 NuevoProducto. Todos los derechos reservados.',
        },
      },
    ],
  },
];
