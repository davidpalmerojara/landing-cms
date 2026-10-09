'use client';

import { useRef, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';
import { useContactForm } from '@/hooks/useContactForm';
import EditableText from './EditableText';
import { useContactFormContext } from './contact-form-context';

const FIELD_CLASS = 'w-full px-4 py-3 rounded-lg text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--theme-primary)]';
const FIELD_STYLE = { backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' };

/** The working form, shown on the page (preview mode). It only sends from a published page. */
function LiveContactForm({ blockId, data }: Pick<BlockProps, 'blockId' | 'data'>) {
  const t = useTranslations('blocks');
  const { slug } = useContactFormContext();
  const { status, errorKind, isSending, submit } = useContactForm(slug, blockId);
  const formRef = useRef<HTMLFormElement>(null);
  const canSend = slug !== null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend || isSending) return;
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) ?? '');
    const sent = await submit({
      name: field('name'),
      email: field('email'),
      message: field('message'),
      website: field('website'),
    });
    if (sent) formRef.current?.reset();
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4" aria-busy={isSending}>
      <div className="grid grid-cols-1 @tablet:grid-cols-2 gap-4">
        <div>
          <label htmlFor={`${blockId}-name`} className="sr-only">{t('contactName')}</label>
          <input
            id={`${blockId}-name`}
            name="name"
            type="text"
            required
            maxLength={100}
            autoComplete="name"
            placeholder={(data.namePlaceholder as string) || t('contactName')}
            className={FIELD_CLASS}
            style={FIELD_STYLE}
          />
        </div>
        <div>
          <label htmlFor={`${blockId}-email`} className="sr-only">{t('contactEmail')}</label>
          <input
            id={`${blockId}-email`}
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder={(data.emailPlaceholder as string) || t('contactEmail')}
            className={FIELD_CLASS}
            style={FIELD_STYLE}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`${blockId}-message`} className="sr-only">{t('contactMessage')}</label>
        <textarea
          id={`${blockId}-message`}
          name="message"
          required
          maxLength={2000}
          placeholder={(data.messagePlaceholder as string) || t('contactMessagePlaceholder')}
          className={`${FIELD_CLASS} h-32 resize-none`}
          style={FIELD_STYLE}
        />
      </div>

      {/* Honeypot: invisible to people and assistive tech, tempting to bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <button
        type="submit"
        disabled={!canSend || isSending}
        className="w-full py-3 text-white rounded-lg font-medium hover:opacity-90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--theme-primary)]"
        style={{ backgroundColor: 'var(--theme-primary)' }}
      >
        {isSending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
        <span>{isSending ? t('contactSending') : (data.buttonText as string) || t('contactSend')}</span>
      </button>

      {!canSend && (
        <p className="text-center text-sm" style={{ color: 'var(--theme-text-muted)' }}>
          {t('contactPreviewNote')}
        </p>
      )}
      <div role="status" className="text-center text-sm">
        {status === 'success' && (
          <p className="flex items-center justify-center gap-2" style={{ color: 'var(--theme-text)' }}>
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            {t('contactSuccess')}
          </p>
        )}
      </div>
      {status === 'error' && errorKind && (
        <p role="alert" className="flex items-center justify-center gap-2 text-center text-sm text-error">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          {t(`contactError.${errorKind}`)}
        </p>
      )}
    </form>
  );
}

export default function ContactBlock({ blockId, data, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  return (
    <section
      aria-label={t('contactAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } py-16 px-6 @tablet:py-24 @tablet:px-8`}
      style={{ backgroundColor: 'var(--theme-surface)' }}
    >
      <div className="max-w-xl mx-auto">
        <EditableText
          blockId={blockId}
          fieldKey="title"
          value={data.title as string}
          as="h2"
          className="text-center mb-4 text-3xl @tablet:text-4xl"
          style={{ color: 'var(--theme-text)', fontFamily: 'var(--bp-font-heading)', fontWeight: 'var(--bp-font-weight-heading)' as unknown as number }}
        />
        <EditableText
          blockId={blockId}
          fieldKey="subtitle"
          value={data.subtitle as string}
          as="p"
          className="text-center mb-10"
          style={{ color: 'var(--theme-text-muted)' }}
        />

        {isPreviewMode ? (
          <LiveContactForm blockId={blockId} data={data} />
        ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 @tablet:grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${blockId}-name`} className="sr-only">{t('contactName')}</label>
              <input
                id={`${blockId}-name`}
                type="text"
                placeholder={(data.namePlaceholder as string) || t('contactName')}
                readOnly
                className="w-full px-4 py-3 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
              />
            </div>
            <div>
              <label htmlFor={`${blockId}-email`} className="sr-only">{t('contactEmail')}</label>
              <input
                id={`${blockId}-email`}
                type="email"
                placeholder={(data.emailPlaceholder as string) || t('contactEmail')}
                readOnly
                className="w-full px-4 py-3 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
              />
            </div>
          </div>
          <div>
            <label htmlFor={`${blockId}-message`} className="sr-only">{t('contactMessage')}</label>
            <textarea
              id={`${blockId}-message`}
              placeholder={(data.messagePlaceholder as string) || t('contactMessagePlaceholder')}
              readOnly
              className="w-full px-4 py-3 rounded-lg text-sm h-32 resize-none"
              style={{ backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
            />
          </div>
          <button
            className="w-full py-3 text-white rounded-lg font-medium hover:opacity-90 transition-colors flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--theme-primary)' }}
          >
            <Send className="w-4 h-4" />
            <EditableText blockId={blockId} fieldKey="buttonText" value={data.buttonText as string} />
          </button>
        </div>
        )}
      </div>
    </section>
  );
}
