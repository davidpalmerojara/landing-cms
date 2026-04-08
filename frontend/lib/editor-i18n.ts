import type { StyleGroupKey, StyleFieldDefinition } from '@/lib/block-styles-config';
import type { FieldDefinition } from '@/types/inspector';

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

function translateExactFieldLabel(fieldKey: string, locale: string) {
  if (!isEnglish(locale)) return null;

  const exactLabels: Record<string, string> = {
    title: 'Title',
    subtitle: 'Subtitle',
    buttonText: 'Button text',
    badgeText: 'Badge text',
    secondaryButtonText: 'Secondary button text',
    backgroundImage: 'Background image',
    alignment: 'Alignment',
    brandName: 'Brand name',
    logoImage: 'Logo',
    link1: 'Link 1',
    link2: 'Link 2',
    link3: 'Link 3',
    ctaText: 'CTA text',
    description: 'Description',
    copyright: 'Copyright',
    link1Label: 'Link 1 label',
    link2Label: 'Link 2 label',
    link3Label: 'Link 3 label',
    billingPeriod: 'Billing period',
    popularBadgeText: 'Popular badge text',
    columns: 'Columns',
    namePlaceholder: 'Name placeholder',
    emailPlaceholder: 'Email placeholder',
    messagePlaceholder: 'Message placeholder',
    html: 'HTML code',
  };

  return exactLabels[fieldKey] || null;
}

function translatePatternFieldLabel(fieldKey: string, locale: string) {
  if (!isEnglish(locale)) return null;

  const featureMatch = fieldKey.match(/^feature(\d)(Title|Desc)$/);
  if (featureMatch) {
    return `Feature ${featureMatch[1]} ${featureMatch[2] === 'Title' ? 'title' : 'description'}`;
  }

  const planMatch = fieldKey.match(/^plan(\d)(Name|Price|Features|ButtonText)$/);
  if (planMatch) {
    const suffixMap: Record<string, string> = {
      Name: 'name',
      Price: 'price',
      Features: 'features (one per line)',
      ButtonText: 'button text',
    };
    return `Plan ${planMatch[1]} ${suffixMap[planMatch[2]]}`;
  }

  const questionMatch = fieldKey.match(/^q(\d)$/);
  if (questionMatch) return `Question ${questionMatch[1]}`;

  const answerMatch = fieldKey.match(/^a(\d)$/);
  if (answerMatch) return `Answer ${answerMatch[1]}`;

  const logoMatch = fieldKey.match(/^logo(\d)$/);
  if (logoMatch) return `Company ${logoMatch[1]}`;

  const imageMatch = fieldKey.match(/^image(\d)$/);
  if (imageMatch) return `Image ${imageMatch[1]}`;

  const memberMatch = fieldKey.match(/^member(\d)(Name|Role|Image)$/);
  if (memberMatch) {
    const suffixMap: Record<string, string> = {
      Name: 'name',
      Role: 'role',
      Image: 'photo',
    };
    return `Member ${memberMatch[1]} ${suffixMap[memberMatch[2]]}`;
  }

  const statMatch = fieldKey.match(/^stat(\d)(Value|Label)$/);
  if (statMatch) {
    return `Stat ${statMatch[1]} ${statMatch[2] === 'Value' ? 'value' : 'label'}`;
  }

  const itemMatch = fieldKey.match(/^item(\d)(Date|Title|Desc)$/);
  if (itemMatch) {
    const suffixMap: Record<string, string> = {
      Date: 'date',
      Title: 'title',
      Desc: 'description',
    };
    return `Event ${itemMatch[1]} ${suffixMap[itemMatch[2]]}`;
  }

  return null;
}

export function translateFieldDefinition(field: FieldDefinition, locale: string): FieldDefinition {
  const translatedLabel =
    translateExactFieldLabel(field.key, locale) ||
    translatePatternFieldLabel(field.key, locale) ||
    field.label;

  return {
    ...field,
    label: translatedLabel,
    options: field.options?.map((option) => ({
      ...option,
      label: translateSelectOptionLabel(field.key, option.value, locale) || option.label,
    })),
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
