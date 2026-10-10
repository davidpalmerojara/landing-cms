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
    fields: [
      { key: 'title', label: 'Título de Sección', type: 'textarea' },
      {
        key: 'features',
        label: 'Características',
        type: 'list',
        itemLabel: 'Característica',
        maxItems: blockSchemas.features.features.max,
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
    fields: [
      { key: 'title', label: 'Título de Sección', type: 'textarea' },
      {
        key: 'testimonials',
        label: 'Testimonios',
        type: 'list',
        itemLabel: 'Testimonio',
        maxItems: blockSchemas.testimonials.testimonials.max,
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
    fields: [
      { key: 'brandName', label: 'Nombre de Marca', type: 'text' },
      { key: 'description', label: 'Descripción', type: 'textarea' },
      {
        key: 'links',
        label: 'Enlaces',
        type: 'list',
        itemLabel: 'Enlace',
        maxItems: blockSchemas.footer.links.max,
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
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      {
        key: 'questions',
        label: 'Preguntas',
        type: 'list',
        itemLabel: 'Pregunta',
        maxItems: blockSchemas.faq.questions.max,
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
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      {
        key: 'logos',
        label: 'Empresas',
        type: 'list',
        itemLabel: 'Empresa',
        maxItems: blockSchemas.logoCloud.logos.max,
        itemFields: [{ key: 'name', label: 'Nombre', type: 'text' }],
      },
    ],
    component: LogoCloudBlock,
  },
  gallery: {
    type: 'gallery',
    label: 'Gallery',
    icon: GalleryHorizontalEnd,
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
    fields: [
      { key: 'html', label: 'Código HTML', type: 'textarea' },
    ],
    component: CustomHtmlBlock,
  },
  navbar: {
    type: 'navbar',
    label: 'Navbar',
    icon: Navigation,
    fields: [
      { key: 'brandName', label: 'Nombre de Marca', type: 'text' },
      { key: 'logoImage', label: 'Logo', type: 'image' },
      {
        key: 'links',
        label: 'Enlaces',
        type: 'list',
        itemLabel: 'Enlace',
        maxItems: blockSchemas.navbar.links.max,
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
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'members',
        label: 'Miembros',
        type: 'list',
        itemLabel: 'Miembro',
        maxItems: blockSchemas.team.members.max,
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
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'stats',
        label: 'Cifras',
        type: 'list',
        itemLabel: 'Cifra',
        maxItems: blockSchemas.stats.stats.max,
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
    fields: [
      { key: 'title', label: 'Título', type: 'textarea' },
      {
        key: 'events',
        label: 'Eventos',
        type: 'list',
        itemLabel: 'Evento',
        maxItems: blockSchemas.timeline.events.max,
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
  }));
}

/** Editor fields of a block type, seen without the type (as the inspector renders them). */
export function getBlockFields(type: BlockType): FieldDefinition[] {
  return blockRegistry[type].fields;
}
