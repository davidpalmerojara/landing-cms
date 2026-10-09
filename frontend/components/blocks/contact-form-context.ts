import { createContext, useContext } from 'react';

export interface ContactFormContextValue {
  /** Slug of the published page. null wherever the form cannot send (editor, preview). */
  slug: string | null;
  /** A guest's published page: it exists, but doesn't collect visitors' messages */
  guestPage?: boolean;
}

const ContactFormContext = createContext<ContactFormContextValue>({ slug: null });

export const ContactFormProvider = ContactFormContext.Provider;

export function useContactFormContext(): ContactFormContextValue {
  return useContext(ContactFormContext);
}
