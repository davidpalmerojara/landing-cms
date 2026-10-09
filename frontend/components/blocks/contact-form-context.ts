import { createContext, useContext } from 'react';

export interface ContactFormContextValue {
  /** Slug of the published page. null wherever the form cannot send (editor, preview). */
  slug: string | null;
}

const ContactFormContext = createContext<ContactFormContextValue>({ slug: null });

export const ContactFormProvider = ContactFormContext.Provider;

export function useContactFormContext(): ContactFormContextValue {
  return useContext(ContactFormContext);
}
