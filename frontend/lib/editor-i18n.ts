import type { StyleGroupKey, StyleFieldDefinition } from '@/lib/block-styles-config';
import type { FieldDefinition, ScalarFieldDefinition } from '@/types/inspector';

function isEnglish(locale: string) {
  return locale.startsWith('en');
}

function translateSelectOptionLabel(fieldKey: string, value: string, locale: string) {
  if (!isEnglish(locale)) return null;

  if (fieldKey === 'alignment') {
    if (value === 'center') return 'Center';
    if (value === 'left') return 'Left';
  }

  if (fieldKey === 'columns') {
    return `${value} columns`;
  }

  return null;
}

const EXACT_FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  subtitle: 'Subtitle',
  buttonText: 'Button text',
  badgeText: 'Badge text',
  buttonLink: 'Button link',
  secondaryButtonText: 'Secondary button text',
  secondaryButtonLink: 'Secondary button link',
  backgroundImage: 'Background image',
  alignment: 'Alignment',
  brandName: 'Brand name',
  logoImage: 'Logo',
  ctaText: 'CTA text',
  ctaLink: 'CTA link',
  description: 'Description',
  copyright: 'Copyright',
  billingPeriod: 'Billing period',
  popularBadgeText: 'Popular badge text',
  columns: 'Columns',
  namePlaceholder: 'Name placeholder',
  emailPlaceholder: 'Email placeholder',
  messagePlaceholder: 'Message placeholder',
  html: 'HTML code',
  // List fields
  features: 'Features',
  testimonials: 'Testimonials',
  plans: 'Plans',
  questions: 'Questions',
  logos: 'Companies',
  images: 'Images',
  members: 'Members',
  stats: 'Stats',
  events: 'Events',
  links: 'Links',
};

/** Name of one item of each list field. */
const LIST_ITEM_LABELS: Record<string, string> = {
  features: 'Feature',
  testimonials: 'Testimonial',
  plans: 'Plan',
  questions: 'Question',
  logos: 'Company',
  images: 'Image',
  members: 'Member',
  stats: 'Stat',
  events: 'Event',
  links: 'Link',
};

/** Fields inside list items, by `listKey.itemKey`. */
const LIST_ITEM_FIELD_LABELS: Record<string, string> = {
  'features.title': 'Title',
  'features.description': 'Description',
  'testimonials.quote': 'Testimonial',
  'testimonials.author': 'Author',
  'testimonials.role': 'Role',
  'plans.name': 'Name',
  'plans.price': 'Price',
  'plans.features': 'Features (one per line)',
  'plans.buttonText': 'Button text',
  'plans.buttonLink': 'Button link',
  'plans.highlighted': 'Highlighted',
  'questions.question': 'Question',
  'questions.answer': 'Answer',
  'logos.name': 'Name',
  'images.src': 'Image',
  'images.alt': 'Alternative text',
  'members.name': 'Name',
  'members.role': 'Role',
  'members.image': 'Photo',
  'stats.value': 'Value',
  'stats.label': 'Label',
  'events.date': 'Date',
  'events.title': 'Title',
  'events.description': 'Description',
  'links.label': 'Text',
  'links.url': 'Destination',
};

function translateScalarField(field: ScalarFieldDefinition, label: string | undefined, locale: string): ScalarFieldDefinition {
  const translated = { ...field, label: label || field.label };
  if (translated.type !== 'select') return translated;
  return {
    ...translated,
    options: translated.options.map((option) => ({
      ...option,
      label: translateSelectOptionLabel(field.key, option.value, locale) || option.label,
    })),
  };
}

/** Field labels are written in Spanish in the block registry; English comes from these tables. */
export function translateFieldDefinition(field: FieldDefinition, locale: string): FieldDefinition {
  const english = isEnglish(locale);
  const label = english ? EXACT_FIELD_LABELS[field.key] : undefined;
  if (field.type !== 'list') return translateScalarField(field, label, locale);

  return {
    ...field,
    label: label || field.label,
    itemLabel: (english && LIST_ITEM_LABELS[field.key]) || field.itemLabel,
    itemFields: field.itemFields.map((itemField) =>
      translateScalarField(
        itemField,
        english ? LIST_ITEM_FIELD_LABELS[`${field.key}.${itemField.key}`] : undefined,
        locale,
      ),
    ),
  };
}

export function translateStyleGroupLabel(groupKey: StyleGroupKey, locale: string) {
  if (!isEnglish(locale)) {
    if (groupKey === 'background') return 'Color de fondo';
    if (groupKey === 'padding') return 'Padding';
    if (groupKey === 'margin') return 'Margin';
    return 'Border Radius';
  }

  if (groupKey === 'background') return 'Background color';
  if (groupKey === 'padding') return 'Padding';
  if (groupKey === 'margin') return 'Margin';
  return 'Corner radius';
}

export function translateStyleField(field: StyleFieldDefinition, locale: string): StyleFieldDefinition {
  if (!isEnglish(locale)) return field;

  const labels: Partial<Record<StyleFieldDefinition['key'], string>> = {
    bgColor: 'Background color',
    paddingTop: 'Top',
    paddingBottom: 'Bottom',
    paddingLeft: 'Left',
    paddingRight: 'Right',
    marginTop: 'Top',
    marginBottom: 'Bottom',
    borderRadius: 'Corner radius',
  };

  return {
    ...field,
    label: labels[field.key] || field.label,
  };
}
