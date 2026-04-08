'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Search, Share2, Globe, Eye, EyeOff, ChevronDown, Image as ImageIcon, X,
} from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import type { SeoFields } from '@/types/page';

function CharCounter({ value, max, warn }: { value: string; max: number; warn: number }) {
  const len = value.length;
  const isWarn = len > warn;
  const isOver = len > max;
  return (
    <span className={`text-[10px] tabular-nums ${isOver ? 'text-red-400' : isWarn ? 'text-amber-400' : 'text-muted'}`}>
      {len}/{max}
    </span>
  );
}

function SeoInput({
  label, value, onChange, maxLength, warnLength, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  maxLength: number; warnLength: number; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-muted uppercase tracking-widest">{label}</label>
        <CharCounter value={value} max={maxLength} warn={warnLength} />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength + 10}
        placeholder={placeholder}
        className="w-full bg-surface-elevated border border-surface-elevated\/80 rounded-lg px-3 py-2 text-[12px] text-primary placeholder:text-muted focus:outline-none focus:border-[#2563EB]/50 transition-colors"
      />
    </div>
  );
}

function SeoTextarea({
  label, value, onChange, maxLength, warnLength, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  maxLength: number; warnLength: number; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-muted uppercase tracking-widest">{label}</label>
        <CharCounter value={value} max={maxLength} warn={warnLength} />
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength + 10}
        placeholder={placeholder}
        rows={3}
        className="w-full bg-surface-elevated border border-surface-elevated\/80 rounded-lg px-3 py-2 text-[12px] text-primary placeholder:text-muted focus:outline-none focus:border-[#2563EB]/50 transition-colors resize-none"
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
          <Globe className="w-3 h-3 text-gray-500" />
        </div>
        <span className="text-[11px] text-gray-600 truncate">{url || t('domainFallback')}</span>
      </div>
      <h3 className="text-[15px] text-[#1a0dab] font-medium leading-snug line-clamp-2 cursor-pointer hover:underline">
        {title || t('titleFallback')}
      </h3>
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
          <img src={image} alt="OG" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-32 bg-gray-100 flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-gray-300" />
        </div>
      )}
      <div className="p-3 space-y-1">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{domain || t('domainFallback')}</p>
        <h4 className="text-[13px] text-gray-900 font-semibold leading-snug line-clamp-2">
          {title || t('titleFallback')}
        </h4>
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
  const page = useEditorStore((s) => s.page);
  const updateSeo = useEditorStore((s) => s.updateSeo);
  const seo = page.seo || {
    seoTitle: '', seoDescription: '', seoCanonicalUrl: '',
    ogTitle: '', ogDescription: '', ogImage: '', ogType: 'website', noindex: false,
  };

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
  const resolvedCanonical = seo.seoCanonicalUrl || `https://paxl.com/p/${page.slug}`;
  const domain = (() => {
    try { return new URL(resolvedCanonical).hostname; } catch { return 'paxl.com'; }
  })();

  return (
    <aside className="w-64 lg:w-72 xl:w-80 bg-surface border-l border-surface-elevated\/80 flex flex-col shrink-0 z-20">
      <div className="h-14 flex items-center px-5 border-b border-surface-elevated\/80 shrink-0">
        <h2 className="text-[13px] font-semibold text-primary flex items-center gap-2 tracking-wide">
          <Search className="w-4 h-4 text-muted" /> {t('panelTitle')}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="pb-10">
          {/* Basic SEO */}
          <div className="border-b border-surface-elevated\/50">
            <button
              onClick={() => toggleSection('seo')}
              className="w-full flex items-center justify-between p-5 hover:bg-surface-elevated\/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-secondary">
                <Search className="w-4 h-4 text-muted" />
                <span className="text-[12px] font-medium tracking-wide">{t('metaTags')}</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted transition-transform duration-200 ${openSections.seo ? '' : '-rotate-90'}`} />
            </button>
            {openSections.seo && (
              <div className="px-5 pb-6 space-y-5">
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
                  placeholder={`https://paxl.com/p/${page.slug}`}
                />
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest block">
                      {t('hideFromSearch')}
                    </label>
                    <p className="text-[10px] text-muted mt-0.5">{t('hideFromSearchHint')}</p>
                  </div>
                  <button
                    onClick={() => updateSeo('noindex', !seo.noindex)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      seo.noindex ? 'bg-red-500/80' : 'bg-border-default'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        seo.noindex ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                {seo.noindex && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <EyeOff className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span className="text-[11px] text-red-300">
                      {t('hideFromSearchWarning')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Open Graph */}
          <div className="border-b border-surface-elevated\/50">
            <button
              onClick={() => toggleSection('og')}
              className="w-full flex items-center justify-between p-5 hover:bg-surface-elevated\/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-secondary">
                <Share2 className="w-4 h-4 text-muted" />
                <span className="text-[12px] font-medium tracking-wide">{t('openGraph')}</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted transition-transform duration-200 ${openSections.og ? '' : '-rotate-90'}`} />
            </button>
            {openSections.og && (
              <div className="px-5 pb-6 space-y-5">
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
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest block">
                    {t('ogImage')}
                  </label>
                  {seo.ogImage ? (
                    <div className="relative rounded-lg overflow-hidden border border-surface-elevated\/50">
                      <img src={seo.ogImage} alt="OG" className="w-full h-24 object-cover" />
                      <button
                        onClick={() => updateSeo('ogImage', '')}
                        className="absolute top-1.5 right-1.5 p-1 bg-surface-elevated\/80 rounded-full hover:bg-surface-card transition-colors"
                      >
                        <X className="w-3 h-3 text-secondary" />
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={seo.ogImage}
                      onChange={(e) => updateSeo('ogImage', e.target.value)}
                      placeholder={t('ogImagePlaceholder')}
                      className="w-full bg-surface-elevated border border-surface-elevated\/80 rounded-lg px-3 py-2 text-[12px] text-primary placeholder:text-muted focus:outline-none focus:border-[#2563EB]/50 transition-colors"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest block">
                    {t('ogType')}
                  </label>
                  <select
                    value={seo.ogType}
                    onChange={(e) => updateSeo('ogType', e.target.value)}
                    className="w-full bg-surface-elevated border border-surface-elevated\/80 rounded-lg px-3 py-2 text-[12px] text-primary focus:outline-none focus:border-[#2563EB]/50 transition-colors"
                  >
                    <option value="website">{t('ogTypeWebsite')}</option>
                    <option value="article">{t('ogTypeArticle')}</option>
                    <option value="product">{t('ogTypeProduct')}</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="border-b border-surface-elevated\/50">
            <button
              onClick={() => toggleSection('preview')}
              className="w-full flex items-center justify-between p-5 hover:bg-surface-elevated\/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-secondary">
                <Eye className="w-4 h-4 text-muted" />
                <span className="text-[12px] font-medium tracking-wide">{t('previews')}</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted transition-transform duration-200 ${openSections.preview ? '' : '-rotate-90'}`} />
            </button>
            {openSections.preview && (
              <div className="px-5 pb-6 space-y-5">
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
