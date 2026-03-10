import {
  Layout,
  BoxSelect,
  MessageSquare,
  MousePointer2,
  PanelBottom,
} from 'lucide-react';

import type { BlockDefinition } from '@/types/blocks';

import HeroBlock from '@/components/blocks/HeroBlock';
import FeaturesBlock from '@/components/blocks/FeaturesBlock';
import TestimonialsBlock from '@/components/blocks/TestimonialsBlock';
import CtaBlock from '@/components/blocks/CtaBlock';
import FooterBlock from '@/components/blocks/FooterBlock';

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
};

export function getAvailableBlocks() {
  return Object.values(blockRegistry).map((b) => ({
    type: b.type,
    label: b.label,
    icon: b.icon,
  }));
}
