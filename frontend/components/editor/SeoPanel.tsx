'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Search, Share2, Globe, Eye, EyeOff, ChevronDown, Image as ImageIcon, X,
} from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import { defaultSeoFields } from '@/types/page';
import { SITE_URL, siteHost } from '@/lib/site-url';
import { PAGE_LANGUAGE_OPTIONS, languageName } from '@/lib/page-language';
import { OG_TYPES, type OgType } from '@/lib/public-metadata';

function CharCounter({ id, value, max, warn }: { id: string; value: string; max: number; warn: number }) {
  const t = useTranslations('seo');
  const len = value.length;
  const isWarn = len > warn;
  const isOver = len > max;
  const status = isOver ? t('charCountOver') : isWarn ? t('charCountWarn') : '';
  const count = t('charCount', { count: len, max });
  return (
    <span id={id} className={`text-[10px] tabular-nums ${isOver ? 'text-error' : isWarn ? 'text-warning' : 'text-muted'}`}>
      <span aria-hidden="true">{len}/{max}</span>
      <span className="sr-only">{status ? `${count}, ${status}` : count}</span>
    </span>
  );
}

interface SeoFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  warnLength: number;
  placeholder?: string;
}

const seoFieldClass =
  'w-full bg-surface-elevated border border-surface-elevated/80 rounded-lg px-3 py-2 text-[12px] text-primary placeholder:text-muted focus:outline-none focus:border-[#2563EB]/50 transition-colors';

function SeoInput({ label, value, onChange, maxLength, warnLength, placeholder }: SeoFieldProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[10px] font-bold text-muted uppercase tracking-widest">{label}</label>
        <CharCounter id={`${id}-count`} value={value} max={maxLength} warn={warnLength} />
      </div>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength + 10}
        placeholder={placeholder}
        aria-describedby={`${id}-count`}
        className={seoFieldClass}
      />
    </div>
  );
}

function SeoTextarea({ label, value, onChange, maxLength, warnLength, placeholder }: SeoFieldProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[10px] font-bold text-muted uppercase tracking-widest">{label}</label>
        <CharCounter id={`${id}-count`} value={value} max={maxLength} warn={warnLength} />
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength + 10}
        placeholder={placeholder}
        rows={3}
        aria-describedby={`${id}-count`}
        className={`${seoFieldClass} resize-none`}
      />
    </div>
  );
}

// --- Google Search Preview ---
function GooglePreview({ title, url, description }: { title: string; url: string; description: string }) {
  const t = useTranslations('seo');
  return (
    <div className="bg-white rounded-lg p-4 space-y-1">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center">
          <Globe aria-hidden="true" className="w-3 h-3 text-gray-500" />
        </div>
        <span className="text-[11px] text-gray-600 truncate">{url || siteHost()}</span>
      </div>
      <p className="text-[15px] text-[#1a0dab] font-medium leading-snug line-clamp-2">
        {title || t('titleFallback')}
      </p>
      <p className="text-[12px] text-[#545454] leading-relaxed line-clamp-2">
        {description || t('descriptionFallback')}
      </p>
    </div>
  );
}

// --- Social Card Preview ---
function SocialPreview({
  title, description, image, domain,
}: { title: string; description: string; image: string; domain: string }) {
  const t = useTranslations('seo');
  return (
    <div className="bg-white rounded-lg overflow-hidden border border-gray-200">
      {image ? (
        <div className="h-32 bg-gray-100 overflow-hidden">
          <img src={image} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-32 bg-gray-100 flex items-center justify-center">
          <ImageIcon aria-hidden="true" className="w-8 h-8 text-gray-300" />
        </div>
      )}
      <div className="p-3 space-y-1">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{domain || siteHost()}</p>
        <p className="text-[13px] text-gray-900 font-semibold leading-snug line-clamp-2">
          {title || t('titleFallback')}
        </p>
        <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">
          {description || t('socialDescriptionFallback')}
        </p>
      </div>
    </div>
  );
}

type Section = 'seo' | 'og' | 'preview';

export default function SeoPanel() {
  const t = useTranslations('seo');
  const uiLocale = useLocale();
  const page = useEditorStore((s) => s.page);
  const updateSeo = useEditorStore((s) => s.updateSeo);
  const seo = { ...defaultSeoFields, ...page.seo };
  // Only the types the server accepts; an old value shows as "website", which is what pages render (QA-009)
  const ogType = OG_TYPES.includes(seo.ogType as OgType) ? seo.ogType : 'website';
  const languages: string[] = PAGE_LANGUAGE_OPTIONS.includes(seo.language as (typeof PAGE_LANGUAGE_OPTIONS)[number])
    ? [...PAGE_LANGUAGE_OPTIONS]
    : [seo.language, ...PAGE_LANGUAGE_OPTIONS];

  const [openSections, setOpenSections] = useState<Record<Section, boolean>>({
    seo: true, og: true, preview: true,
  });

  const toggleSection = (s: Section) =>
    setOpenSections((prev) => ({ ...prev, [s]: !prev[s] }));

  // Resolved values (with fallbacks)
  const resolvedTitle = seo.seoTitle || page.name;
  const resolvedDescription = seo.seoDescription;
  const resolvedOgTitle = seo.ogTitle || seo.seoTitle || page.name;
  const resolvedOgDescription = seo.ogDescription || seo.seoDescription;
  // The address the page really has once published, on this deployment (QA-085)
  const publicUrl = `${SITE_URL}/p/${page.slug}`;
  const resolvedCanonical = seo.seoCanonicalUrl || publicUrl;
  const domain = (() => {
    try {
      return new URL(resolvedCanonical).hostname;
    } catch (error: unknown) {
      // A canonical URL still being typed: show this site's host meanwhile
      if (error instanceof TypeError) return siteHost();
      throw error;
    }
  })();

  return (
    <aside aria-label={t('panelTitle')} className="w-64 lg:w-72 xl:w-80 bg-surface border-l border-surface-elevated/80 flex flex-col shrink-0 z-20">
      <div className="h-14 flex items-center px-5 border-b border-surface-elevated/80 shrink-0">
        <h2 className="text-[13px] font-semibold text-primary flex items-center gap-2 tracking-wide">
          <Search className="w-4 h-4 text-muted" /> {t('panelTitle')}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="pb-10">
          {/* Basic SEO */}
          <div className="border-b border-surface-elevated/50">
            <button
              type="button"
              onClick={() => toggleSection('seo')}
              aria-expanded={openSections.seo}
              aria-controls="seo-section-seo"
              className="w-full flex items-center justify-between p-5 hover:bg-surface-elevated/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-secondary">
                <Search className="w-4 h-4 text-muted" />
                <span className="text-[12px] font-medium tracking-wide">{t('metaTags')}</span>
              </div>
              <ChevronDown aria-hidden="true" className={`w-4 h-4 text-muted transition-transform duration-200 ${openSections.seo ? '' : '-rotate-90'}`} />
            </button>
            {openSections.seo && (
              <div id="seo-section-seo" className="px-5 pb-6 space-y-5">
                <SeoInput
                  label={t('seoTitle')}
                  value={seo.seoTitle}
                  onChange={(v) => updateSeo('seoTitle', v)}
                  maxLength={70}
                  warnLength={60}
                  placeholder={page.name}
                />
                <SeoTextarea
                  label={t('metaDescription')}
                  value={seo.seoDescription}
                  onChange={(v) => updateSeo('seoDescription', v)}
                  maxLength={160}
                  warnLength={155}
                  placeholder={t('metaDescriptionPlaceholder')}
                />
                <SeoInput
                  label={t('canonicalUrl')}
                  value={seo.seoCanonicalUrl}
                  onChange={(v) => updateSeo('seoCanonicalUrl', v)}
                  maxLength={500}
                  warnLength={500}
                  placeholder={publicUrl}
                />
                <div className="space-y-1.5">
                  <label htmlFor="seo-language" className="text-[10px] font-bold text-muted uppercase tracking-widest block">
                    {t('language')}
                  </label>
                  <select
                    id="seo-language"
                    value={seo.language}
                    onChange={(e) => updateSeo('language', e.target.value)}
                    aria-describedby="seo-language-hint"
                    className="w-full bg-surface-elevated border border-surface-elevated/80 rounded-lg px-3 py-2 text-[12px] text-primary focus:outline-none focus:border-[#2563EB]/50 transition-colors"
                  >
                    {languages.map((tag) => (
                      <option key={tag} value={tag} lang={tag}>{languageName(tag, uiLocale)}</option>
                    ))}
                  </select>
                  <p id="seo-language-hint" className="text-[10px] text-muted">{t('languageHint')}</p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label
                      id="seo-noindex-label"
                      htmlFor="seo-noindex"
                      className="text-[10px] font-bold text-muted uppercase tracking-widest block"
                    >
                      {t('hideFromSearch')}
                    </label>
                    <p id="seo-noindex-hint" className="text-[10px] text-muted mt-0.5">{t('hideFromSearchHint')}</p>
                  </div>
                  <button
                    type="button"
                    id="seo-noindex"
                    role="switch"
                    aria-checked={seo.noindex}
                    aria-labelledby="seo-noindex-label"
                    aria-describedby="seo-noindex-hint"
                    onClick={() => updateSeo('noindex', !seo.noindex)}
                    className={`relative shrink-0 w-9 h-5 rounded-full transition-colors before:absolute before:-inset-1 ${
                      seo.noindex ? 'bg-red-500/80' : 'bg-default'
                    }`}
                  >
                    {/* Knob anchored to the left edge of the track, moved right when on (QA-076) */}
                    <span
                      aria-hidden="true"
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        seo.noindex ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                {seo.noindex && (
                  <div role="status" className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <EyeOff aria-hidden="true" className="w-3.5 h-3.5 text-error shrink-0" />
                    <span className="text-[11px] text-error">
                      {t('hideFromSearchWarning')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Open Graph */}
          <div className="border-b border-surface-elevated/50">
            <button
              type="button"
              onClick={() => toggleSection('og')}
              aria-expanded={openSections.og}
              aria-controls="seo-section-og"
              className="w-full flex items-center justify-between p-5 hover:bg-surface-elevated/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-secondary">
                <Share2 className="w-4 h-4 text-muted" />
                <span className="text-[12px] font-medium tracking-wide">{t('openGraph')}</span>
              </div>
              <ChevronDown aria-hidden="true" className={`w-4 h-4 text-muted transition-transform duration-200 ${openSections.og ? '' : '-rotate-90'}`} />
            </button>
            {openSections.og && (
              <div id="seo-section-og" className="px-5 pb-6 space-y-5">
                <SeoInput
                  label={t('ogTitle')}
                  value={seo.ogTitle}
                  onChange={(v) => updateSeo('ogTitle', v)}
                  maxLength={200}
                  warnLength={60}
                  placeholder={seo.seoTitle || page.name}
                />
                <SeoTextarea
                  label={t('ogDescription')}
                  value={seo.ogDescription}
                  onChange={(v) => updateSeo('ogDescription', v)}
                  maxLength={300}
                  warnLength={155}
                  placeholder={seo.seoDescription || t('ogDescriptionPlaceholder')}
                />
                <div className="space-y-1.5">
                  <label
                    id="seo-og-image-label"
                    htmlFor="seo-og-image"
                    className="text-[10px] font-bold text-muted uppercase tracking-widest block"
                  >
                    {t('ogImage')}
                  </label>
                  {seo.ogImage ? (
                    <div className="relative rounded-lg overflow-hidden border border-surface-elevated/50">
                      <img src={seo.ogImage} alt="" className="w-full h-24 object-cover" />
                      <button
                        type="button"
                        id="seo-og-image"
                        onClick={() => updateSeo('ogImage', '')}
                        aria-label={t('removeOgImage')}
                        title={t('removeOgImage')}
                        className="absolute top-1.5 right-1.5 p-1.5 bg-surface-elevated/80 rounded-full hover:bg-surface-card transition-colors before:absolute before:-inset-1"
                      >
                        <X aria-hidden="true" className="w-3 h-3 text-secondary" />
                      </button>
                    </div>
                  ) : (
                    <input
                      id="seo-og-image"
                      type="text"
                      value={seo.ogImage}
                      onChange={(e) => updateSeo('ogImage', e.target.value)}
                      placeholder={t('ogImagePlaceholder')}
                      className={seoFieldClass}
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="seo-og-type" className="text-[10px] font-bold text-muted uppercase tracking-widest block">
                    {t('ogType')}
                  </label>
                  <select
                    id="seo-og-type"
                    value={ogType}
                    onChange={(e) => updateSeo('ogType', e.target.value)}
                    className="w-full bg-surface-elevated border border-surface-elevated/80 rounded-lg px-3 py-2 text-[12px] text-primary focus:outline-none focus:border-[#2563EB]/50 transition-colors"
                  >
                    <option value="website">{t('ogTypeWebsite')}</option>
                    <option value="article">{t('ogTypeArticle')}</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="border-b border-surface-elevated/50">
            <button
              type="button"
              onClick={() => toggleSection('preview')}
              aria-expanded={openSections.preview}
              aria-controls="seo-section-preview"
              className="w-full flex items-center justify-between p-5 hover:bg-surface-elevated/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-secondary">
                <Eye className="w-4 h-4 text-muted" />
                <span className="text-[12px] font-medium tracking-wide">{t('previews')}</span>
              </div>
              <ChevronDown aria-hidden="true" className={`w-4 h-4 text-muted transition-transform duration-200 ${openSections.preview ? '' : '-rotate-90'}`} />
            </button>
            {openSections.preview && (
              <div id="seo-section-preview" className="px-5 pb-6 space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Search className="w-3 h-3 text-muted" />
                    <span className="text-[10px] font-bold text-muted uppercase tracking-widest">{t('google')}</span>
                  </div>
                  <GooglePreview
                    title={resolvedTitle}
                    url={resolvedCanonical}
                    description={resolvedDescription}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Share2 className="w-3 h-3 text-muted" />
                    <span className="text-[10px] font-bold text-muted uppercase tracking-widest">{t('socialMedia')}</span>
                  </div>
                  <SocialPreview
                    title={resolvedOgTitle}
                    description={resolvedOgDescription}
                    image={seo.ogImage}
                    domain={domain}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
