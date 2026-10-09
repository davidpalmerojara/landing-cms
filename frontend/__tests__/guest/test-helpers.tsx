import { act } from 'react';
import type { ApiUser } from '@/lib/api';

export const guestUser: ApiUser = {
  id: 'g1',
  email: 'invitado-ab12cd34@guest.invalid',
  username: 'invitado-ab12cd34',
  avatar: '',
  created_at: '2026-10-09T10:00:00Z',
  is_guest: true,
  expires_at: '2026-10-10T10:00:00Z',
};

export const normalUser: ApiUser = {
  ...guestUser,
  id: 'u1',
  email: 'ana@example.com',
  username: 'ana',
  is_guest: false,
  expires_at: null,
};

/** Types into a controlled React input the way a user would. */
export function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('no value setter');
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export function field(root: ParentNode, label: string): HTMLInputElement {
  const labelEl = [...root.querySelectorAll('label')].find((l) => l.textContent === label);
  const id = labelEl?.getAttribute('for');
  const input = id ? root.querySelector<HTMLInputElement>(`[id="${id}"]`) : null;
  if (!input) throw new Error(`No field labelled "${label}"`);
  return input;
}

export function buttonByText(root: ParentNode, text: string): HTMLButtonElement {
  const button = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!button) throw new Error(`No button "${text}"`);
  return button;
}

export function submit(form: HTMLFormElement) {
  act(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}
