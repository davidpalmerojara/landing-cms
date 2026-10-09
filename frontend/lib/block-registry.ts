import {
  Layout,
  BoxSelect,
  MessageSquare,
  MousePointer2,
  PanelBottom,
  CreditCard,
  HelpCircle,
  Building2,
  GalleryHorizontalEnd,
  Mail,
  Code2,
  Navigation,
  Users,
  BarChart3,
  Clock,
} from 'lucide-react';

import type { BlockRegistry, BlockType } from '@/types/blocks';
import type { FieldDefinition } from '@/types/inspector';
import { blockSchemas } from '@/lib/block-data';

import HeroBlock from '@/components/blocks/HeroBlock';
import FeaturesBlock from '@/components/blocks/FeaturesBlock';
import TestimonialsBlock from '@/components/blocks/TestimonialsBlock';
import CtaBlock from '@/components/blocks/CtaBlock';
import FooterBlock from '@/components/blocks/FooterBlock';
import PricingBlock from '@/components/blocks/PricingBlock';
import FaqBlock from '@/components/blocks/FaqBlock';
import LogoCloudBlock from '@/components/blocks/LogoCloudBlock';
import GalleryBlock from '@/components/blocks/GalleryBlock';
import ContactBlock from '@/components/blocks/ContactBlock';
import CustomHtmlBlock from '@/components/blocks/CustomHtmlBlock';
import NavbarBlock from '@/components/blocks/NavbarBlock';
import TeamBlock from '@/components/blocks/TeamBlock';
import StatsBlock from '@/components/blocks/StatsBlock';
import TimelineBlock from '@/components/blocks/TimelineBlock';

export const blockRegistry: BlockRegistry = {
  hero: {
    type: 'hero',
    label: 'Hero Section',
    icon: Layout,
    initialData: {
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
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'buttonText', label: 'Texto del Botón', type: 'text' },
      { key: 'buttonLink', label: 'Enlace del Botón', type: 'text' },
      { key: 'badgeText', label: 'Texto del Badge', type: 'text' },
      { key: 'secondaryButtonText', label: 'Texto Botón Secundario', type: 'text' },
      { key: 'secondaryButtonLink', label: 'Enlace Botón Secundario', type: 'text' },
      { key: 'backgroundImage', label: 'Imagen de Fondo', type: 'image' },
      {
        key: 'alignment',
        label: 'Alineación',
        type: 'select',
        options: [
          { value: 'center', label: 'Centrado' },
          { value: 'left', label: 'Izquierda' },
        ],
      },
    ],
    component: HeroBlock,
  },
  features: {
    type: 'features',
    label: 'Features Grid',
    icon: BoxSelect,
    initialData: {
      title: 'Descubre las ventajas',
      features: [
        { title: 'Característica 1', description: 'Descripción breve de esta característica increíble.' },
        { title: 'Característica 2', description: 'Descripción breve de esta característica increíble.' },
      ],
    },
    fields: [
      { key: 'title', label: 'Título de Sección', type: 'textarea' },
      {
        key: 'features',
        label: 'Características',
        type: 'list',
        itemLabel: 'Característica',
        maxItems: blockSchemas.features.features.max,
        newItem: { title: 'Nueva característica', description: 'Descripción breve de esta característica.' },
        itemFields: [
          { key: 'title', label: 'Título', type: 'text' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
        ],
      },
    ],
    component: FeaturesBlock,
  },
  testimonials: {
    type: 'testimonials',
    label: 'Testimonials',
    icon: MessageSquare,
    initialData: {
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
    fields: [
      { key: 'title', label: 'Título de Sección', type: 'textarea' },
      {
        key: 'testimonials',
        label: 'Testimonios',
        type: 'list',
        itemLabel: 'Testimonio',
        maxItems: blockSchemas.testimonials.testimonials.max,
        newItem: { quote: 'Escribe aquí lo que dice tu cliente.', author: 'Nombre', role: 'Cargo en Empresa' },
        itemFields: [
          { key: 'quote', label: 'Testimonio', type: 'textarea' },
          { key: 'author', label: 'Autor', type: 'text' },
          { key: 'role', label: 'Rol', type: 'text' },
        ],
      },
    ],
    component: TestimonialsBlock,
  },
  cta: {
    type: 'cta',
    label: 'Call to Action',
    icon: MousePointer2,
    initialData: {
      title: 'Comienza tu viaje',
      subtitle: '',
      buttonText: 'Suscribirse',
      buttonLink: '',
    },
    fields: [
      { key: 'title', label: 'Título Principal', type: 'textarea' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'buttonText', label: 'Texto del Botón', type: 'text' },
      { key: 'buttonLink', label: 'Enlace del Botón', type: 'text' },
    ],
    component: CtaBlock,
  },
  footer: {
    type: 'footer',
    label: 'Footer Simple',
    icon: PanelBottom,
    initialData: {
      brandName: 'Acme Corp',
      description: 'Construyendo el futuro de la web, un bloque a la vez. Únete a nuestra revolución digital.',
      copyright: '© 2026 Acme Corporation. Todos los derechos reservados.',
      links: [
        { label: 'Producto', url: '' },
        { label: 'Precios', url: '' },
        { label: 'Contacto', url: '' },
      ],
    },
    fields: [
      { key: 'brandName', label: 'Nombre de Marca', type: 'text' },
      { key: 'description', label: 'Descripción', type: 'textarea' },
      {
        key: 'links',
        label: 'Enlaces',
        type: 'list',
        itemLabel: 'Enlace',
        maxItems: blockSchemas.footer.links.max,
        newItem: { label: 'Nuevo enlace', url: '' },
        itemFields: [
          { key: 'label', label: 'Texto', type: 'text' },
          { key: 'url', label: 'Destino', type: 'text' },
        ],
      },
      { key: 'copyright', label: 'Copyright', type: 'textarea' },
    ],
    component: FooterBlock,
  },
  pricing: {
    type: 'pricing',
    label: 'Pricing',
    icon: CreditCard,
    initialData: {
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
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'billingPeriod', label: 'Periodo de facturación', type: 'text' },
      { key: 'popularBadgeText', label: 'Texto badge popular', type: 'text' },
      {
        key: 'plans',
        label: 'Planes',
        type: 'list',
        itemLabel: 'Plan',
        maxItems: blockSchemas.pricing.plans.max,
        newItem: {
          name: 'Nuevo plan',
          price: '€99',
          features: 'Característica 1\nCaracterística 2',
          buttonText: 'Elegir plan',
          buttonLink: '',
          highlighted: false,
        },
        itemFields: [
          { key: 'name', label: 'Nombre', type: 'text' },
          { key: 'price', label: 'Precio', type: 'text' },
          { key: 'features', label: 'Features (1 por línea)', type: 'textarea' },
          { key: 'buttonText', label: 'Botón', type: 'text' },
          { key: 'buttonLink', label: 'Enlace del botón', type: 'text' },
          { key: 'highlighted', label: 'Destacado', type: 'toggle' },
        ],
      },
    ],
    component: PricingBlock,
  },
  faq: {
    type: 'faq',
    label: 'FAQ',
    icon: HelpCircle,
    initialData: {
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
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      {
        key: 'questions',
        label: 'Preguntas',
        type: 'list',
        itemLabel: 'Pregunta',
        maxItems: blockSchemas.faq.questions.max,
        newItem: { question: 'Nueva pregunta', answer: 'Escribe aquí la respuesta.' },
        itemFields: [
          { key: 'question', label: 'Pregunta', type: 'text' },
          { key: 'answer', label: 'Respuesta', type: 'textarea' },
        ],
      },
    ],
    component: FaqBlock,
  },
  logoCloud: {
    type: 'logoCloud',
    label: 'Logo Cloud',
    icon: Building2,
    initialData: {
      title: 'Empresas que confían en nosotros',
      logos: [
        { name: 'Acme Corp' },
        { name: 'TechFlow' },
        { name: 'DataPrime' },
        { name: 'CloudBase' },
        { name: 'NextWave' },
      ],
    },
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      {
        key: 'logos',
        label: 'Empresas',
        type: 'list',
        itemLabel: 'Empresa',
        maxItems: blockSchemas.logoCloud.logos.max,
        newItem: { name: 'Nueva empresa' },
        itemFields: [{ key: 'name', label: 'Nombre', type: 'text' }],
      },
    ],
    component: LogoCloudBlock,
  },
  gallery: {
    type: 'gallery',
    label: 'Gallery',
    icon: GalleryHorizontalEnd,
    initialData: {
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
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'columns',
        label: 'Columnas',
        type: 'select',
        options: [
          { value: '2', label: '2 columnas' },
          { value: '3', label: '3 columnas' },
          { value: '4', label: '4 columnas' },
        ],
      },
      {
        key: 'images',
        label: 'Imágenes',
        type: 'list',
        itemLabel: 'Imagen',
        maxItems: blockSchemas.gallery.images.max,
        newItem: { src: '', alt: '' },
        itemFields: [
          { key: 'src', label: 'Imagen', type: 'image' },
          { key: 'alt', label: 'Texto alternativo', type: 'text' },
        ],
      },
    ],
    component: GalleryBlock,
  },
  contact: {
    type: 'contact',
    label: 'Contact Form',
    icon: Mail,
    initialData: {
      title: 'Contacto',
      subtitle: '¿Tienes alguna pregunta? Escríbenos y te responderemos lo antes posible.',
      buttonText: 'Enviar mensaje',
      namePlaceholder: 'Nombre',
      emailPlaceholder: 'Email',
      messagePlaceholder: 'Tu mensaje...',
    },
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'buttonText', label: 'Texto del Botón', type: 'text' },
      { key: 'namePlaceholder', label: 'Placeholder Nombre', type: 'text' },
      { key: 'emailPlaceholder', label: 'Placeholder Email', type: 'text' },
      { key: 'messagePlaceholder', label: 'Placeholder Mensaje', type: 'text' },
    ],
    component: ContactBlock,
  },
  customHtml: {
    type: 'customHtml',
    label: 'Custom HTML',
    icon: Code2,
    initialData: {
      html: '',
    },
    fields: [
      { key: 'html', label: 'Código HTML', type: 'textarea' },
    ],
    component: CustomHtmlBlock,
  },
  navbar: {
    type: 'navbar',
    label: 'Navbar',
    icon: Navigation,
    initialData: {
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
    fields: [
      { key: 'brandName', label: 'Nombre de Marca', type: 'text' },
      { key: 'logoImage', label: 'Logo', type: 'image' },
      {
        key: 'links',
        label: 'Enlaces',
        type: 'list',
        itemLabel: 'Enlace',
        maxItems: blockSchemas.navbar.links.max,
        newItem: { label: 'Nuevo enlace', url: '' },
        itemFields: [
          { key: 'label', label: 'Texto', type: 'text' },
          { key: 'url', label: 'Destino', type: 'text' },
        ],
      },
      { key: 'ctaText', label: 'Texto CTA', type: 'text' },
      { key: 'ctaLink', label: 'Enlace CTA', type: 'text' },
    ],
    component: NavbarBlock,
  },
  team: {
    type: 'team',
    label: 'Team',
    icon: Users,
    initialData: {
      title: 'Nuestro equipo',
      subtitle: 'Las personas detrás del producto que estás construyendo.',
      members: [
        { name: 'Ana López', role: 'CEO & Co-fundadora', image: '' },
        { name: 'Carlos Martín', role: 'CTO', image: '' },
        { name: 'Laura García', role: 'Head of Design', image: '' },
      ],
    },
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'members',
        label: 'Miembros',
        type: 'list',
        itemLabel: 'Miembro',
        maxItems: blockSchemas.team.members.max,
        newItem: { name: 'Nuevo miembro', role: 'Rol', image: '' },
        itemFields: [
          { key: 'name', label: 'Nombre', type: 'text' },
          { key: 'role', label: 'Rol', type: 'text' },
          { key: 'image', label: 'Foto', type: 'image' },
        ],
      },
    ],
    component: TeamBlock,
  },
  stats: {
    type: 'stats',
    label: 'Stats',
    icon: BarChart3,
    initialData: {
      title: 'Números que hablan',
      subtitle: 'Nuestro impacto en cifras reales.',
      stats: [
        { value: '10K+', label: 'Usuarios activos' },
        { value: '99.9%', label: 'Uptime' },
        { value: '150+', label: 'Países' },
        { value: '4.9/5', label: 'Valoración' },
      ],
    },
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'stats',
        label: 'Cifras',
        type: 'list',
        itemLabel: 'Cifra',
        maxItems: blockSchemas.stats.stats.max,
        newItem: { value: '100+', label: 'Nueva cifra' },
        itemFields: [
          { key: 'value', label: 'Valor', type: 'text' },
          { key: 'label', label: 'Etiqueta', type: 'text' },
        ],
      },
    ],
    component: StatsBlock,
  },
  timeline: {
    type: 'timeline',
    label: 'Timeline',
    icon: Clock,
    initialData: {
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
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      {
        key: 'events',
        label: 'Eventos',
        type: 'list',
        itemLabel: 'Evento',
        maxItems: blockSchemas.timeline.events.max,
        newItem: { date: 'Fecha', title: 'Nuevo evento', description: 'Describe lo que pasó.' },
        itemFields: [
          { key: 'date', label: 'Fecha', type: 'text' },
          { key: 'title', label: 'Título', type: 'text' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
        ],
      },
    ],
    component: TimelineBlock,
  },
};

export function getAvailableBlocks() {
  return Object.values(blockRegistry).map((b) => ({
    type: b.type,
    label: b.label,
    icon: b.icon,
    initialData: b.initialData,
  }));
}

/** Editor fields of a block type, seen without the type (as the inspector renders them). */
export function getBlockFields(type: BlockType): FieldDefinition[] {
  return blockRegistry[type].fields;
}
