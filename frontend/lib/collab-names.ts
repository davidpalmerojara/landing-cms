/**
 * How people in a shared page are named on screen (QA-108).
 *
 * A guest's account is created with a generated username (`invitado-1a2b3c4d`)
 * and an email that cannot receive mail (`…@guest.invalid`). Neither means
 * anything to the people editing together, so the editor shows "Invitado 1",
 * "Invitado 2"… and hides the email.
 */

/** Usernames the server generates for guests (accounts/guests.py). */
const GUEST_USERNAME = /^invitado-[0-9a-f]{8}$/;

/** Email domain of guest accounts (accounts/guests.py GUEST_EMAIL_DOMAIN). */
const GUEST_EMAIL_DOMAIN = '@guest.invalid';

/** The username was generated for a guest (a guest who claimed the account picked their own). */
export function isGuestUsername(username: string): boolean {
  return GUEST_USERNAME.test(username);
}

/** A guest account's placeholder email: never shown. */
export function isGuestEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(GUEST_EMAIL_DOMAIN);
}

/**
 * Avatar initials: the first letter plus a trailing
 * number, so "Invitado 1" and "Invitado 2" are "I1" and "I2", not two "I".
 */
export function presenceInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const number = /(\d+)$/.exec(trimmed)?.[1];
  const first = trimmed.charAt(0).toUpperCase();
  return number && number !== trimmed ? `${first}${number}` : first;
}
