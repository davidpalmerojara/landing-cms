import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import FaqBlock from '@/components/blocks/FaqBlock';
import FeaturesBlock from '@/components/blocks/FeaturesBlock';
import GalleryBlock from '@/components/blocks/GalleryBlock';
import PricingBlock from '@/components/blocks/PricingBlock';
import TimelineBlock from '@/components/blocks/TimelineBlock';
import BlockContent from '@/components/blocks/BlockContent';
import { useEditorStore } from '@/store/editor-store';
import { getAtPath, normalizeBlockData } from '@/lib/block-data';
import { makeBlock, makePage, render, resetEditorStore } from '../mobile-editor/test-utils';

const props = { blockId: 'b1' };

describe('list blocks render their arrays', () => {
  beforeEach(() => resetEditorStore());

  it('faq renders every question and skips empty ones', () => {
    const questions = ['Uno', 'Dos', '', 'Cuatro', 'Cinco', 'Seis'].map((question) => ({ question, answer: `R ${question}` }));
    const view = render(<FaqBlock {...props} isPreviewMode={false} data={normalizeBlockData('faq', { title: 'FAQ', questions })} />);
    const headings = Array.from(view.container.querySelectorAll('h3')).map((h) => h.textContent);
    expect(headings).toEqual(['Uno', 'Dos', 'Cuatro', 'Cinco', 'Seis']);
    view.unmount();
  });

  it('pricing renders N plans, any of them highlighted, with a grid for the count', () => {
    const plans = [
      { name: 'Pro', price: '€49', features: 'A\nB', buttonText: 'Elegir Pro', highlighted: true },
      { name: 'Team', price: '€99', features: 'C', buttonText: 'Elegir Team' },
      { name: 'Enterprise', price: '€199', features: '', buttonText: 'Hablar' },
    ];
    const data = normalizeBlockData('pricing', { title: 'Precios', popularBadgeText: 'Top', plans });
    const view = render(<PricingBlock {...props} isPreviewMode data={data} />);
    const names = Array.from(view.container.querySelectorAll('h3')).map((h) => h.textContent);
    expect(names).toEqual(['Pro', 'Team', 'Enterprise']);
    expect(view.container.querySelector('.grid')?.className).toContain('@tablet:grid-cols-3');
    // The badge sits next to the highlighted plan's name, the first one here
    expect(view.container.querySelector('h3')?.parentElement?.textContent).toBe('ProTop');
    // No links: the plan buttons show as text, never as buttons that do nothing (D9)
    expect(view.container.querySelectorAll('button')).toHaveLength(0);
    expect(view.container.textContent).toContain('Elegir Team');
    view.unmount();

    const single = render(<PricingBlock {...props} isPreviewMode data={{ ...data, plans: data.plans.slice(0, 1) }} />);
    expect(single.container.querySelector('.grid')?.className).toContain('max-w-md');
    single.unmount();
  });

  it('features cycle their icons by position', () => {
    const features = ['A', 'B', 'C', 'D'].map((title) => ({ title, description: '' }));
    const view = render(<FeaturesBlock {...props} isPreviewMode data={normalizeBlockData('features', { features })} />);
    const icons = Array.from(view.container.querySelectorAll('svg')).map((svg) => svg.getAttribute('class')?.split(' ')[1]);
    expect(icons).toEqual(['lucide-smartphone', 'lucide-monitor', 'lucide-zap', 'lucide-shield']);
    view.unmount();
  });

  it('gallery uses the alt text of each image and a placeholder for empty slots', () => {
    const images = [
      { src: 'https://example.com/a.jpg', alt: 'Plato de la casa' },
      { src: 'https://example.com/b.jpg', alt: '' },
      { src: '', alt: 'Sin foto' },
    ];
    const view = render(<GalleryBlock {...props} isPreviewMode data={normalizeBlockData('gallery', { images })} />);
    const alts = Array.from(view.container.querySelectorAll('img')).map((img) => img.getAttribute('alt'));
    expect(alts).toEqual(['Plato de la casa', 'Imagen de galería 2']);
    expect(view.container.querySelectorAll('.aspect-\\[4\\/3\\]')).toHaveLength(3);
    view.unmount();
  });

  it('an empty list renders the block without that part', () => {
    const view = render(<TimelineBlock {...props} isPreviewMode data={normalizeBlockData('timeline', { title: 'Historia', events: [] })} />);
    expect(view.container.querySelector('h2')?.textContent).toBe('Historia');
    expect(view.container.querySelector('.space-y-10')).toBeNull();
    view.unmount();
  });
});

describe('inline editing of list items', () => {
  it('writes the edited text at the item path', () => {
    const block = makeBlock('features', {
      title: 'Ventajas',
      features: [
        { title: 'Primera', description: '' },
        { title: 'Segunda', description: '' },
      ],
    }, { id: 'feat' });
    resetEditorStore(makePage([block]));
    useEditorStore.setState({ selectedBlockId: 'feat' });
    const view = render(<BlockContent block={block} isPreviewMode={false} />);

    const second = Array.from(view.container.querySelectorAll('h3')).find((h) => h.textContent === 'Segunda');
    if (!second) throw new Error('no item title');
    act(() => {
      second.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    const editable = view.container.querySelector<HTMLElement>('[contenteditable]');
    if (!editable) throw new Error('not editing');
    act(() => {
      editable.innerText = 'Segunda editada';
      editable.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    const data = useEditorStore.getState().page.blocks[0].data;
    expect(getAtPath(data, ['features', 1, 'title'])).toBe('Segunda editada');
    expect(getAtPath(data, ['features', 0, 'title'])).toBe('Primera');
    view.unmount();
  });
});
