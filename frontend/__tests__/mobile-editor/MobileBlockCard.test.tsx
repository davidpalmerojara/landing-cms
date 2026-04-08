import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MobileBlockCard from '@/components/mobile-editor/MobileBlockCard';
import { makeBlock, render, click, resetEditorStore } from './test-utils';

describe('MobileBlockCard', () => {
  beforeEach(() => {
    resetEditorStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the block icon, preview and drag handle', () => {
    const block = makeBlock('hero', {
      title: 'Hero headline',
      subtitle: 'Hero subtitle',
      buttonText: 'Comprar',
    });

    const onTap = vi.fn();
    const view = render(
      <MobileBlockCard
        block={block}
        index={1}
        isFirst={false}
        isLast={false}
        isPreviewExpanded={false}
        onTap={onTap}
        onLongPress={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onDragHandleProps={{ onTouchStart: vi.fn() }}
      />,
    );

    expect(view.container.querySelector('svg')).toBeInTheDocument();
    expect(view.container.textContent).toContain('Hero');
    expect(view.container.textContent).toContain('Hero headline');
    expect(view.container.querySelector('[aria-label="Mantén para reordenar"]')).toBeInTheDocument();

    view.unmount();
  });

  it('calls onTap when the card is clicked', () => {
    const block = makeBlock('hero', { title: 'Tap me' });
    const onTap = vi.fn();
    const view = render(
      <MobileBlockCard
        block={block}
        index={0}
        isFirst
        isLast
        isPreviewExpanded={false}
        onTap={onTap}
        onLongPress={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onDragHandleProps={{ onTouchStart: vi.fn() }}
      />,
    );

    const card = view.container.querySelector('[role="listitem"] p.text-sm.font-medium.text-white') as HTMLElement;
    click(card);
    expect(onTap).toHaveBeenCalledWith(block.id);

    view.unmount();
  });

  it('opens the contextual menu with duplicate, delete and move actions', () => {
    const block = makeBlock('hero', { title: 'Menu block' });
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();

    const view = render(
      <MobileBlockCard
        block={block}
        index={1}
        isFirst={false}
        isLast={false}
        isPreviewExpanded={false}
        onTap={vi.fn()}
        onLongPress={vi.fn()}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDragHandleProps={{ onTouchStart: vi.fn() }}
      />,
    );

    const menuButton = view.container.querySelector('[aria-label="Opciones para Hero"]') as HTMLElement;
    click(menuButton);

    const menu = view.container.querySelector('[role="menu"]');
    expect(menu).toBeInTheDocument();
    expect(menu?.textContent).toContain('Duplicar');
    expect(menu?.textContent).toContain('Eliminar');
    expect(menu?.textContent).toContain('Mover arriba');
    expect(menu?.textContent).toContain('Mover abajo');

    const duplicate = [...view.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Duplicar') && b.getAttribute('role') === 'menuitem') as HTMLElement;
    click(duplicate);
    expect(onDuplicate).toHaveBeenCalledWith(block.id);

    click(menuButton);
    const remove = [...view.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Eliminar') && b.getAttribute('role') === 'menuitem') as HTMLElement;
    click(remove);
    expect(onDelete).toHaveBeenCalledWith(block.id);

    click(menuButton);
    const moveUp = [...view.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Mover arriba')) as HTMLElement;
    click(moveUp);
    expect(onMoveUp).toHaveBeenCalledWith(block.id);

    click(menuButton);
    const moveDown = [...view.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Mover abajo')) as HTMLElement;
    click(moveDown);
    expect(onMoveDown).toHaveBeenCalledWith(block.id);

    view.unmount();
  });
});
