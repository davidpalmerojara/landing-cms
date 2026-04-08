'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Globe, Plus, Trash2, RefreshCw, CheckCircle2, AlertCircle,
  Loader2, Copy, ExternalLink, ArrowLeft, Crown, Clock, Shield,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiCustomDomain, ApiPageListItem } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

type DomainWithError = ApiCustomDomain & { dns_error?: string };

function StatusBadge({ domain }: { domain: ApiCustomDomain }) {
  const t = useTranslations();
  if (domain.is_active) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
        <CheckCircle2 className="w-3 h-3" />
        {t('domains.active')}
      </span>
    );
  }
  if (domain.dns_status === 'verified' && domain.ssl_status !== 'active') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-full">
        <Shield className="w-3 h-3 animate-pulse" />
        {t('domains.verifyingSsl')}
      </span>
    );
  }
  if (domain.dns_status === 'failed') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
        <AlertCircle className="w-3 h-3" />
        {t('domains.dnsError')}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
      <Clock className="w-3 h-3" />
      {t('domains.dnsPending')}
    </span>
  );
}

function DnsInstructions({ domain }: { domain: ApiCustomDomain }) {
  const t = useTranslations();
  const [copied, setCopied] = useState('');

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const instructions = domain.dns_instructions;
  if (!instructions) return null;

  return (
    <div className="mt-4 p-4 bg-surface-elevated\/50 rounded-lg border border-subtle\/50 space-y-3">
      <h4 className="text-[11px] font-bold text-secondary uppercase tracking-widest">{t('domains.dnsConfig')}</h4>
      <p className="text-[12px] text-muted">
        {t('domains.dnsDescription')}
      </p>
      <div className="space-y-2">
        {/* CNAME */}
        <div className="flex items-center gap-3 p-2.5 bg-surface rounded-md border border-subtle\/50">
          <span className="text-[10px] font-bold text-primary-color bg-primary\/10 px-2 py-0.5 rounded">CNAME</span>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] text-secondary">{t('domains.recordName')} </span>
            <span className="text-[11px] text-primary font-mono">{instructions.cname.name}</span>
            <span className="text-[11px] text-muted mx-2">→</span>
            <span className="text-[11px] text-primary font-mono">{instructions.cname.value}</span>
          </div>
          <button
            onClick={() => copyToClipboard(instructions.cname.value, 'cname')}
            className="text-muted hover:text-secondary p-1"
            title={t('domains.copy')}
          >
            {copied === 'cname' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
        {/* A Record alternative */}
        <div className="flex items-center gap-3 p-2.5 bg-surface rounded-md border border-subtle\/50">
          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">A</span>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] text-secondary">{t('domains.recordName')} </span>
            <span className="text-[11px] text-primary font-mono">{instructions.alternative_a_record.name}</span>
            <span className="text-[11px] text-muted mx-2">→</span>
            <span className="text-[11px] text-primary font-mono">{instructions.alternative_a_record.value}</span>
          </div>
          <button
            onClick={() => copyToClipboard(instructions.alternative_a_record.value, 'a')}
            className="text-muted hover:text-secondary p-1"
            title={t('domains.copy')}
          >
            {copied === 'a' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <div className="text-[11px] text-muted space-y-1 pt-1">
        <p>{t('domains.providerCloudflare')}</p>
        <p>{t('domains.providerGodaddy')}</p>
        <p>{t('domains.providerNamecheap')}</p>
      </div>
    </div>
  );
}

function AddDomainModal({
  pages, onAdd, onClose,
}: {
  pages: ApiPageListItem[];
  onAdd: (domain: string, pageId: string | undefined) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [domain, setDomain] = useState('');
  const [pageId, setPageId] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!domain.trim()) return;
    setError('');
    setIsAdding(true);
    try {
      await onAdd(domain.trim().toLowerCase(), pageId || undefined);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('domains.addDomainError'));
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-elevated border border-subtle rounded-xl p-6 w-full max-w-[420px] mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-primary mb-4">{t('domains.addDomain')}</h3>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-bold text-muted uppercase tracking-widest block mb-1.5">{t('domains.domain')}</label>
            <input
              autoFocus
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder={t('domains.domainPlaceholder')}
              className="w-full bg-surface border border-subtle rounded-lg px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-muted uppercase tracking-widest block mb-1.5">{t('domains.pageOptional')}</label>
            <select
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              className="w-full bg-surface border border-subtle rounded-lg px-3 py-2.5 text-sm text-primary focus:outline-none focus:border-primary/50"
            >
              <option value="">{t('domains.unassignedPage')}</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.slug})</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-[12px] bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!domain.trim() || isAdding}
            className="flex items-center gap-2 text-white font-bold text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t('domains.addDomain')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DomainsSettingsPage() {
  const t = useTranslations();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth({ redirectTo: '/login' });
  const [domains, setDomains] = useState<DomainWithError[]>([]);
  const [pages, setPages] = useState<ApiPageListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [isPro, setIsPro] = useState<boolean | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [domainRes, pagesRes] = await Promise.all([
        api.domains.list(),
        api.pages.list(),
      ]);
      setDomains(domainRes.results);
      setPages(pagesRes.results);

      // Check plan
      try {
        const sub = await api.billing.subscription();
        setIsPro(sub.subscription?.plan?.has_custom_domain ?? false);
      } catch {
        setIsPro(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('domains.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = async (domain: string, pageId: string | undefined) => {
    const payload: { domain: string; page?: string } = { domain };
    if (pageId) payload.page = pageId;
    await api.domains.create(payload);
    loadData();
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      const result = await api.domains.verify(id);
      setDomains((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...result } : d))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('domains.verifyError'));
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async (id: string, domain: string) => {
    if (!window.confirm(t('domains.deleteConfirm', { domain }))) return;
    try {
      await api.domains.delete(id);
      setDomains((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('domains.deleteError'));
    }
  };

  if (isAuthLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface text-secondary">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-secondary">
      <header className="border-b border-subtle\/80">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-muted hover:text-secondary p-1.5 rounded-md hover:bg-surface-card\/50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary-color" />
            <span className="font-semibold text-primary">{t('domains.title')}</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm mb-6 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">×</button>
          </div>
        )}

        {isPro === false && (
          <div className="mb-8 p-6 bg-gradient-to-r from-primary/10 to-primary/10 border border-primary/20 rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <Crown className="w-5 h-5 text-amber-400" />
              <h3 className="font-semibold text-primary">{t('domains.proFeatureTitle')}</h3>
            </div>
            <p className="text-[13px] text-secondary mb-4">
              {t('domains.proFeatureDescription')}
            </p>
            <button
              onClick={() => router.push('/settings/billing')}
              className="text-white font-bold text-sm px-4 py-2 rounded-lg transition-colors"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
            >
              {t('domains.upgradeToPro')}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-primary">{t('domains.domainsLabel')}</h2>
            <p className="text-sm text-muted mt-1">{t('domains.configuredCount', { count: domains.length })}</p>
          </div>
          {isPro !== false && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 text-white font-bold text-sm px-4 py-2 rounded-lg shadow-lg shadow-primary/20 transition-all"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
            >
              <Plus className="w-4 h-4" />
              {t('domains.addDomain')}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted" />
          </div>
        ) : domains.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-surface-elevated rounded-2xl flex items-center justify-center mb-4">
              <Globe className="w-8 h-8 text-muted" />
            </div>
            <h3 className="text-base font-medium text-secondary mb-2">{t('domains.emptyTitle')}</h3>
            <p className="text-sm text-muted mb-6">{t('domains.emptyDescription')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {domains.map((d) => (
              <div key={d.id} className="bg-surface-elevated\/50 border border-subtle\/80 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-muted" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-primary">{d.domain}</span>
                        <StatusBadge domain={d} />
                      </div>
                      {d.page_name && (
                        <p className="text-[11px] text-muted mt-0.5">
                          {t('domains.pageLabel', { name: d.page_name })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.is_active && (
                      <a
                        href={`https://${d.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted hover:text-secondary p-1.5 rounded-md hover:bg-surface-card\/50 transition-colors"
                        title={t('domains.visit')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    {!d.is_active && (
                      <button
                        onClick={() => handleVerify(d.id)}
                        disabled={verifyingId === d.id}
                        className="flex items-center gap-1.5 text-[11px] font-medium text-primary-color hover:text-primary-color/80 bg-primary\/10 hover:bg-primary\/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {verifyingId === d.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        {t('domains.verify')}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(d.id, d.domain)}
                      className="text-muted hover:text-red-400 p-1.5 rounded-md hover:bg-red-500/10 transition-colors"
                      title={t('common.delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Show DNS instructions when not yet verified */}
                {d.dns_status !== 'verified' && <DnsInstructions domain={d} />}

                {/* Show error message */}
                {d.dns_error && (
                  <div className="mt-3 flex items-center gap-2 text-red-400 text-[12px] bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {d.dns_error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {showAddModal && (
        <AddDomainModal
          pages={pages}
          onAdd={handleAdd}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
