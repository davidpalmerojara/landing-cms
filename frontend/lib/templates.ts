import { defaultBlockStyles } from '@/types/blocks';
import type { Block, BlockDataMap, BlockType } from '@/types/blocks';
import { newBlockId } from '@/lib/block-factory';
import { defaultDesignTokens, presetTokens, tokensToApi } from '@/lib/design-tokens';
import type { DesignTokens } from '@/lib/design-tokens';
import { makeBlock } from '@/lib/block-data';

/** A block of a template: any subset of its type's data (the rest is empty). */
type TemplateBlock = {
  [K in BlockType]: {
    type: K;
    data: Partial<BlockDataMap[K]>;
    styles?: Partial<typeof defaultBlockStyles>;
  };
}[BlockType];

export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  /** Id of the tokenPresets entry whose colors the page starts with */
  presetId: string;
  category: string;
  /** Block types in order; each can override data and styles */
  blocks: TemplateBlock[];
}

/** Instantiate a template's blocks with unique IDs */
export function instantiateTemplate(template: PageTemplate): {
  blocks: Block[];
  designTokens: DesignTokens;
  name: string;
} {
  const blocks: Block[] = template.blocks.map((def) =>
    makeBlock({ id: newBlockId(), name: def.type, styles: { ...defaultBlockStyles, ...def.styles } }, def.type, def.data),
  );
  return { blocks, designTokens: presetTokens(template.presetId), name: template.name };
}

/**
 * Body of `POST /api/pages/` for a new page: the template's blocks and theme,
 * or a blank page named `blankName` when `templateId` is null or unknown.
 */
export function buildPagePayload(templateId: string | null, blankName: string): Record<string, unknown> {
  const template = templateId ? pageTemplates.find((candidate) => candidate.id === templateId) : undefined;
  if (!template) {
    return { name: blankName, design_tokens: tokensToApi(defaultDesignTokens), blocks: [] };
  }
  const { blocks, designTokens, name } = instantiateTemplate(template);
  return {
    name,
    design_tokens: tokensToApi(designTokens),
    blocks: blocks.map((b, i) => ({
      id: b.id,
      type: b.type,
      order: i,
      data: b.data,
      styles: b.styles,
    })),
  };
}

// ─── Template definitions ────────────────────────────────────────
// Data keys are checked against the block's data type (types/block-data.ts).

export const pageTemplates: PageTemplate[] = [
  // ── 1. SaaS Landing ─────────────────────────────────────────
  {
    id: 'saas-landing',
    name: 'SaaS Landing',
    description: 'Página de producto SaaS con hero, stats, features, testimonios, pricing, FAQ y CTA.',
    presetId: 'dark',
    category: 'Negocio',
    blocks: [
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
    ],
  },

  // ── 2. Portfolio ────────────────────────────────────────────
  // Basado en docs/mockup-template2.tsx
  {
    id: 'portfolio',
    name: 'Portfolio',
    description: 'Portafolio personal de diseñador con proyectos, servicios, testimonios y contacto.',
    presetId: 'slate',
    category: 'Creativo',
    blocks: [
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
    ],
  },

  // ── 3. Restaurante ─────────────────────────────────────────
  // Basado en docs/mockup-template3.tsx
  {
    id: 'restaurant',
    name: 'Restaurante',
    description: 'Landing para restaurante de brasa con galería de platos, testimonios, ubicación y reservas.',
    presetId: 'ember',
    category: 'Gastronomía',
    blocks: [
      {
        type: 'navbar',
        data: {
          brandName: 'La Brasa',
          logoImage: '',
          links: [
            { label: 'El Menú', url: '#gallery' },
            { label: 'Nuestra Historia', url: '#features' },
            { label: 'Ubicación', url: '#cta' },
          ],
          ctaText: 'Reservar Mesa',
          ctaLink: '#cta',
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
          features: [
            {
              title: 'Ingredientes de proximidad',
              description: 'Trabajamos exclusivamente con productores locales para garantizar la máxima frescura y calidad en cada plato.',
            },
            {
              title: 'Horno de leña tradicional',
              description: 'Nuestras carnes y verduras se preparan lentamente en nuestro horno de leña, dándoles ese sabor ahumado inconfundible.',
            },
          ],
        },
      },
      {
        type: 'gallery',
        data: {
          title: 'Nuestros platos estrella',
          subtitle: 'Un vistazo a lo que te espera en La Brasa.',
          columns: '3',
          images: [
            { src: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', alt: '' },
            { src: 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80', alt: '' },
            { src: 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=800&q=80', alt: '' },
            { src: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80', alt: '' },
            { src: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80', alt: '' },
            { src: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80', alt: '' },
          ],
        },
      },
      {
        type: 'testimonials',
        data: {
          title: 'Reseñas de nuestros comensales',
          testimonials: [
            {
              quote: 'El mejor chuletón que he probado en mi vida. El ambiente es acogedor y el servicio impecable. Repetiremos seguro.',
              author: 'Javier M.',
              role: 'Guía Local de Google',
            },
            {
              quote: 'Increíble experiencia. Los entrantes son muy originales y los postres caseros son el broche de oro perfecto.',
              author: 'Sofía R.',
              role: 'Cliente habitual',
            },
          ],
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
          links: [
            { label: 'Instagram', url: '' },
            { label: 'TripAdvisor', url: '' },
            { label: 'Aviso Legal', url: '' },
          ],
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
    presetId: 'dark',
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
    ],
  },
];
