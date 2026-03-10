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
} from 'lucide-react';

import type { BlockDefinition } from '@/types/blocks';

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

export const blockRegistry: Record<string, BlockDefinition> = {
  hero: {
    type: 'hero',
    label: 'Hero Section',
    icon: Layout,
    initialData: {
      title: 'Tu Nueva Sección',
      subtitle: 'Añade una descripción cautivadora aquí.',
      buttonText: 'Acción Principal',
    },
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'buttonText', label: 'Texto del Botón', type: 'text' },
    ],
    component: HeroBlock,
  },
  features: {
    type: 'features',
    label: 'Features Grid',
    icon: BoxSelect,
    initialData: {
      title: 'Descubre las ventajas',
      feature1Title: 'Característica 1',
      feature1Desc: 'Descripción breve de esta característica increíble.',
      feature2Title: 'Característica 2',
      feature2Desc: 'Descripción breve de esta característica increíble.',
    },
    fields: [
      { key: 'title', label: 'Título de Sección', type: 'textarea' },
      { key: 'feature1Title', label: 'Título C1', type: 'text' },
      { key: 'feature1Desc', label: 'Descripción C1', type: 'textarea' },
      { key: 'feature2Title', label: 'Título C2', type: 'text' },
      { key: 'feature2Desc', label: 'Descripción C2', type: 'textarea' },
    ],
    component: FeaturesBlock,
  },
  testimonials: {
    type: 'testimonials',
    label: 'Testimonials',
    icon: MessageSquare,
    initialData: {
      title: 'Lo que dicen de nosotros',
      quote1: 'Este producto ha cambiado por completo la forma en que trabajamos. Simplemente brillante.',
      author1: 'María García',
      role1: 'Product Manager en TechCorp',
      quote2: 'La mejor decisión que tomamos este año. El soporte es increíble y los resultados inmediatos.',
      author2: 'Carlos Ruiz',
      role2: 'CTO en Startup.io',
    },
    fields: [
      { key: 'title', label: 'Título de Sección', type: 'textarea' },
      { key: 'quote1', label: 'Testimonio 1', type: 'textarea' },
      { key: 'author1', label: 'Autor 1', type: 'text' },
      { key: 'role1', label: 'Rol 1', type: 'text' },
      { key: 'quote2', label: 'Testimonio 2', type: 'textarea' },
      { key: 'author2', label: 'Autor 2', type: 'text' },
      { key: 'role2', label: 'Rol 2', type: 'text' },
    ],
    component: TestimonialsBlock,
  },
  cta: {
    type: 'cta',
    label: 'Call to Action',
    icon: MousePointer2,
    initialData: {
      title: 'Comienza tu viaje',
      buttonText: 'Suscribirse',
    },
    fields: [
      { key: 'title', label: 'Título Principal', type: 'textarea' },
      { key: 'buttonText', label: 'Texto del Botón', type: 'text' },
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
      link1Label: 'Producto',
      link2Label: 'Precios',
      link3Label: 'Contacto',
    },
    fields: [
      { key: 'brandName', label: 'Nombre de Marca', type: 'text' },
      { key: 'description', label: 'Descripción', type: 'textarea' },
      { key: 'link1Label', label: 'Enlace 1', type: 'text' },
      { key: 'link2Label', label: 'Enlace 2', type: 'text' },
      { key: 'link3Label', label: 'Enlace 3', type: 'text' },
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
      plan1Name: 'Starter',
      plan1Price: '€19',
      plan1Features: 'Hasta 5 páginas\n1 dominio custom\nSoporte por email',
      plan1ButtonText: 'Empezar gratis',
      plan2Name: 'Pro',
      plan2Price: '€49',
      plan2Features: 'Páginas ilimitadas\nDominios ilimitados\nSoporte prioritario\nAnalytics avanzado',
      plan2ButtonText: 'Elegir Pro',
      plan2Highlighted: true,
    },
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'plan1Name', label: 'Plan 1 — Nombre', type: 'text' },
      { key: 'plan1Price', label: 'Plan 1 — Precio', type: 'text' },
      { key: 'plan1Features', label: 'Plan 1 — Features (1 por línea)', type: 'textarea' },
      { key: 'plan1ButtonText', label: 'Plan 1 — Botón', type: 'text' },
      { key: 'plan2Name', label: 'Plan 2 — Nombre', type: 'text' },
      { key: 'plan2Price', label: 'Plan 2 — Precio', type: 'text' },
      { key: 'plan2Features', label: 'Plan 2 — Features (1 por línea)', type: 'textarea' },
      { key: 'plan2ButtonText', label: 'Plan 2 — Botón', type: 'text' },
      { key: 'plan2Highlighted', label: 'Plan 2 destacado', type: 'toggle' },
    ],
    component: PricingBlock,
  },
  faq: {
    type: 'faq',
    label: 'FAQ',
    icon: HelpCircle,
    initialData: {
      title: 'Preguntas frecuentes',
      q1: '¿Cómo empiezo a usar el producto?',
      a1: 'Regístrate gratis, elige una plantilla y empieza a personalizar tu landing page. No necesitas conocimientos técnicos.',
      q2: '¿Puedo usar mi propio dominio?',
      a2: 'Sí, puedes conectar cualquier dominio que poseas. Te guiamos paso a paso en la configuración DNS.',
      q3: '¿Ofrecen soporte técnico?',
      a3: 'Todos los planes incluyen soporte por email. Los planes Pro y superiores tienen soporte prioritario con respuesta en menos de 24 horas.',
    },
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      { key: 'q1', label: 'Pregunta 1', type: 'text' },
      { key: 'a1', label: 'Respuesta 1', type: 'textarea' },
      { key: 'q2', label: 'Pregunta 2', type: 'text' },
      { key: 'a2', label: 'Respuesta 2', type: 'textarea' },
      { key: 'q3', label: 'Pregunta 3', type: 'text' },
      { key: 'a3', label: 'Respuesta 3', type: 'textarea' },
    ],
    component: FaqBlock,
  },
  logoCloud: {
    type: 'logoCloud',
    label: 'Logo Cloud',
    icon: Building2,
    initialData: {
      title: 'Empresas que confían en nosotros',
      logo1: 'Acme Corp',
      logo2: 'TechFlow',
      logo3: 'DataPrime',
      logo4: 'CloudBase',
      logo5: 'NextWave',
    },
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'logo1', label: 'Empresa 1', type: 'text' },
      { key: 'logo2', label: 'Empresa 2', type: 'text' },
      { key: 'logo3', label: 'Empresa 3', type: 'text' },
      { key: 'logo4', label: 'Empresa 4', type: 'text' },
      { key: 'logo5', label: 'Empresa 5', type: 'text' },
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
    },
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'buttonText', label: 'Texto del Botón', type: 'text' },
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
};

export function getAvailableBlocks() {
  return Object.values(blockRegistry).map((b) => ({
    type: b.type,
    label: b.label,
    icon: b.icon,
  }));
}
