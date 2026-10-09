import { describe, it, expect } from 'vitest';
import HeroBlock from '@/components/blocks/HeroBlock';
import CtaBlock from '@/components/blocks/CtaBlock';
import NavbarBlock from '@/components/blocks/NavbarBlock';
import FooterBlock from '@/components/blocks/FooterBlock';
import PricingBlock from '@/components/blocks/PricingBlock';
import { blockAnchorIds } from '@/lib/block-anchors';
import { render } from '../mobile-editor/test-utils';

const props = { blockId: 'b1', isMobile: false, isTablet: false };

function hrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
}

describe('block links', () => {
  it('hero renders anchors for safe links in preview, with rel on external ones', () => {
    const view = render(
      <HeroBlock
        {...props}
        isPreviewMode
        data={{
          title: 'T',
          buttonText: 'Go',
          buttonLink: 'https://example.com/a',
          secondaryButtonText: 'More',
          secondaryButtonLink: '#features',
        }}
      />,
    );
    const anchors = Array.from(view.container.querySelectorAll('a'));
    expect(anchors.map((a) => a.getAttribute('href'))).toEqual(['https://example.com/a', '#features']);
    expect(anchors[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(anchors[1].hasAttribute('rel')).toBe(false);
    expect(anchors[0].textContent).toBe('Go');
    view.unmount();
  });

  it('falls back to a plain button for empty or unsafe links', () => {
    const view = render(
      <CtaBlock {...props} isPreviewMode data={{ title: 'T', buttonText: 'Go', buttonLink: 'javascript:alert(1)' }} />,
    );
    expect(view.container.querySelector('a')).toBeNull();
    expect(view.container.querySelector('button')?.textContent).toBe('Go');
    view.unmount();

    const empty = render(<CtaBlock {...props} isPreviewMode data={{ title: 'T', buttonText: 'Go', buttonLink: '' }} />);
    expect(empty.container.querySelector('a')).toBeNull();
    empty.unmount();
  });

  it('renders no anchors in the editor even when links are set', () => {
    const data = { title: 'T', buttonText: 'Go', buttonLink: 'https://example.com' };
    const view = render(<CtaBlock {...props} isPreviewMode={false} data={data} />);
    expect(view.container.querySelector('a')).toBeNull();
    expect(view.container.querySelector('button')).not.toBeNull();
    view.unmount();
  });

  it('navbar renders nav items and the CTA as links', () => {
    const view = render(
      <NavbarBlock
        {...props}
        isPreviewMode
        data={{
          brandName: 'Acme',
          link1: 'A',
          link1Url: '#features',
          link2: 'B',
          link2Url: '//evil.com',
          link3: 'C',
          link3Url: '/precios',
          ctaText: 'Go',
          ctaLink: 'mailto:hola@example.com',
        }}
      />,
    );
    expect(hrefs(view.container)).toEqual(['#features', '/precios', 'mailto:hola@example.com']);
    view.unmount();
  });

  it('footer renders only the safe links', () => {
    const view = render(
      <FooterBlock
        {...props}
        isPreviewMode
        data={{
          brandName: 'Acme',
          link1Label: 'A',
          link1Url: 'https://example.com',
          link2Label: 'B',
          link2Url: 'data:text/html,x',
          link3Label: 'C',
          link3Url: 'tel:+34600123456',
        }}
      />,
    );
    expect(hrefs(view.container)).toEqual(['https://example.com', 'tel:+34600123456']);
    view.unmount();
  });

  it('pricing renders plan buttons as links', () => {
    const view = render(
      <PricingBlock
        {...props}
        isPreviewMode
        data={{
          plan1ButtonText: 'One',
          plan1ButtonLink: '/registro',
          plan2ButtonText: 'Two',
          plan2ButtonLink: ' javascript:alert(1)',
        }}
      />,
    );
    expect(hrefs(view.container)).toEqual(['/registro']);
    expect(view.container.querySelectorAll('button')).toHaveLength(1);
    view.unmount();
  });
});

describe('blockAnchorIds', () => {
  it('gives the first block of each type its type as id', () => {
    const anchors = blockAnchorIds([
      { id: 'a', type: 'navbar' },
      { id: 'b', type: 'features' },
      { id: 'c', type: 'features' },
      { id: 'd', type: 'pricing' },
    ]);
    expect(anchors.get('a')).toBe('navbar');
    expect(anchors.get('b')).toBe('features');
    expect(anchors.has('c')).toBe(false);
    expect(anchors.get('d')).toBe('pricing');
  });
});
