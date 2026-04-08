'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Plus, FileText, Copy, Trash2, ExternalLink, Globe,
  Loader2, AlertCircle, MoreVertical, LogOut, Users,
  FolderOpen, LayoutTemplate, Image, Settings, Search,
  Bell, TrendingUp, Zap, LayoutGrid, CheckCircle,
  Layers, Pencil, HelpCircle, MessageSquare, ArrowRight,
  Menu, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiPageListItem } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { pageTemplates, instantiateTemplate } from '@/lib/templates';
import TemplatePickerModal from '@/components/dashboard/TemplatePickerModal';
import AIGenerateModal from '@/components/dashboard/AIGenerateModal';
import PagePreviewThumbnail from '@/components/dashboard/PagePreviewThumbnail';

export default function DashboardPage() {
  const t = useTranslations();
  const router = useRouter();
  const { user, isLoading: isAuthLoading, logout } = useAuth({ redirectTo: '/login' });
  const [pages, setPages] = useState<ApiPageListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showAIGenerate, setShowAIGenerate] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sidebarNav = [
    { label: t('dashboard.sidebar.projects'), icon: FolderOpen, href: '/dashboard', active: true },
    { label: t('dashboard.sidebar.templates'), icon: LayoutTemplate, href: '/dashboard', active: false },
    { label: t('dashboard.sidebar.assets'), icon: Image, href: '/dashboard', active: false },
    { label: t('dashboard.sidebar.settings'), icon: Settings, href: '/settings', active: false },
  ];

  const loadPages = useCallback(async () => {
    try {
      setError(null);
      const res = await api.pages.list();
      setPages(res.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dashboard.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  // Re-fetch when tab becomes visible (e.g. returning from editor)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadPages();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [loadPages]);

  const handleOpenCreate = () => {
    setShowTemplatePicker(true);
  };

  const handleCreateFromTemplate = async (templateId: string | null) => {
    setIsCreating(true);
    try {
      let payload: Record<string, unknown>;

      if (templateId) {
        const template = pageTemplates.find((t) => t.id === templateId);
        if (template) {
          const { blocks, themeId, name } = instantiateTemplate(template);
          payload = {
            name,
            theme_id: themeId,
            blocks: blocks.map((b, i) => ({
              id: b.id,
              type: b.type,
              order: i,
              data: b.data,
              styles: b.styles,
            })),
          };
        } else {
          payload = { name: t('dashboard.createUntitled'), blocks: [] };
        }
      } else {
        payload = { name: t('dashboard.createUntitled'), blocks: [] };
      }

      const page = await api.pages.create(payload);
      router.push(`/editor/${page.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('dashboard.createError');
      if (msg.includes('403') && msg.includes('plan_limit')) {
        setError(t('dashboard.planLimit'));
      } else {
        setError(msg);
      }
      setIsCreating(false);
    }
  };

  const handleDuplicate = async (id: string) => {
    setOpenMenuId(null);
    try {
      await api.pages.duplicate(id);
      loadPages();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('dashboard.duplicateError');
      if (msg.includes('403') && msg.includes('plan_limit')) {
        setError(t('dashboard.planLimit'));
      } else {
        setError(msg);
      }
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setOpenMenuId(null);
    if (!window.confirm(t('dashboard.deleteConfirm', { name }))) return;
    try {
      await api.pages.delete(id);
      setPages((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dashboard.deleteError'));
    }
  };

  const totalBlocks = useMemo(
    () => pages.reduce((sum, p) => sum + (p.block_count || 0), 0),
    [pages],
  );

  const publishedCount = useMemo(
    () => pages.filter((p) => p.status === 'published').length,
    [pages],
  );

  const filteredPages = useMemo(() => {
    if (!searchText.trim()) return pages;
    const q = searchText.toLowerCase();
    return pages.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q),
    );
  }, [pages, searchText]);

  if (isAuthLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface text-secondary">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div id="main-content" className="min-h-screen bg-surface text-white">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-full flex flex-col py-8 px-4 w-64 z-40 bg-surface border-r border-default/15 text-sm font-medium tracking-wide transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="mb-10 px-2 flex items-center gap-3">
          <div
            className="w-8 h-8 rounded flex items-center justify-center text-black font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
          >
            B
          </div>
          <div>
            <h1 className="text-lg font-black text-primary leading-tight tracking-tighter">Paxl</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{t('dashboard.sidebar.highPerformance')}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-2">
          {sidebarNav.map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                item.active
                  ? 'bg-surface-card text-primary-color shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]'
                  : 'text-muted hover:text-primary hover:bg-surface-card hover:translate-x-1'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="mt-auto space-y-6">
          {/* Usage card */}
          <div className="p-4 rounded-xl bg-surface-card border border-default/10">
            <p className="text-xs text-muted mb-3">
              {t('dashboard.usage', { current: pages.length, max: 20 })}
            </p>
            <div className="h-1.5 w-full bg-surface-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min((pages.length / 20) * 100, 100)}%` }}
              />
            </div>
            <button
              onClick={() => router.push('/settings/billing')}
              className="mt-4 w-full py-2 text-xs font-bold text-black rounded-full transition-all active:scale-95"
              style={{ background: 'linear-gradient(to right, #2563EB, #2563EB)' }}
            >
              {t('dashboard.upgradePlan')}
            </button>
          </div>

          {/* Support links */}
          <div className="space-y-1">
            <a href="#" className="flex items-center gap-3 px-4 py-2 text-muted hover:text-primary transition-colors">
              <HelpCircle className="w-4 h-4" />
              <span className="text-xs">{t('dashboard.support')}</span>
            </a>
            <button
              onClick={logout}
              className="flex items-center gap-3 px-4 py-2 text-muted hover:text-primary transition-colors w-full text-left"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-xs">{t('dashboard.logout')}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="fixed top-0 right-0 left-0 lg:left-64 h-16 z-50 flex justify-between items-center px-4 lg:px-8 bg-surface/80 backdrop-blur-xl border-b border-default/15">
        <div className="flex items-center gap-4 flex-1">
          {/* Hamburger menu (mobile/tablet) */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-card transition-all text-muted"
            aria-label={t('navigation.main')}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          {/* Search */}
          <div className="relative w-full max-w-xs lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t('dashboard.searchPages')}
              className="w-full bg-surface-elevated border-none rounded-lg pl-10 py-2 text-sm text-white placeholder-muted focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          {/* Nav tabs */}
          <nav className="hidden md:flex items-center gap-6 ml-4">
            <a href="/dashboard" className="text-primary-color border-b-2 border-primary pb-1 text-sm font-bold tracking-tight">
              {t('dashboard.panel')}
            </a>
            <a href="#" className="text-muted hover:text-primary transition-colors text-sm font-bold tracking-tight">
              {t('dashboard.analytics')}
            </a>
            <a href="#" className="text-muted hover:text-primary transition-colors text-sm font-bold tracking-tight">
              {t('dashboard.help')}
            </a>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <button
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-card transition-all text-muted"
            aria-label={t('dashboard.notifications')}
          >
            <Bell className="w-5 h-5" />
          </button>
          <button
            onClick={() => router.push('/settings')}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-card transition-all text-muted"
            aria-label={t('common.settings')}
          >
            <Settings className="w-5 h-5" />
          </button>

          <div className="h-8 w-px bg-default/30 mx-2" />

          <div className="flex items-center gap-3 pl-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-white">{user.username}</p>
              <p className="text-[10px] text-muted uppercase tracking-wider">{t('dashboard.configuredStatus')}</p>
            </div>
            <div className="w-10 h-10 rounded-full border-2 border-primary/20 bg-surface-card flex items-center justify-center text-sm font-bold text-primary-color">
              {user.username?.charAt(0).toUpperCase() || 'U'}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="lg:ml-64 pt-24 pb-12 px-4 lg:px-8 min-h-screen">
        <div className="max-w-7xl mx-auto">
          {/* Header section */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-2">{t('dashboard.title')}</h2>
              <p className="text-muted font-medium">
                {t('dashboard.pagesCount', { count: pages.length })} · {t('dashboard.publishedCount', { count: publishedCount })}
              </p>
            </div>
            <button
              onClick={handleOpenCreate}
              disabled={isCreating}
              className="flex items-center gap-2 px-6 py-3 rounded-full text-black font-bold shadow-[0_16px_32px_-8px_rgba(37, 99, 235,0.3)] active:scale-95 transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(to right, #2563EB, #2563EB)' }}
            >
              {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              <span>{t('dashboard.newPage')}</span>
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-12">
            <div className="bg-surface-elevated p-6 rounded-2xl border border-default/10">
              <p className="text-xs font-bold text-muted uppercase tracking-widest mb-1">{t('dashboard.statsTotalPages')}</p>
              <p className="text-2xl font-black text-white">{pages.length}</p>
              <div className="mt-2 text-[10px] text-primary-color font-bold flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> {t('dashboard.statsTotalPagesHint')}
              </div>
            </div>
            <div className="bg-surface-elevated p-6 rounded-2xl border border-default/10">
              <p className="text-xs font-bold text-muted uppercase tracking-widest mb-1">{t('dashboard.statsPublished')}</p>
              <p className="text-2xl font-black text-white">{publishedCount}</p>
              <div className="mt-2 text-[10px] text-primary-color font-bold flex items-center gap-1">
                <Globe className="w-3 h-3" /> {t('dashboard.statsPublishedHint')}
              </div>
            </div>
            <div className="bg-surface-elevated p-6 rounded-2xl border border-default/10">
              <p className="text-xs font-bold text-muted uppercase tracking-widest mb-1">{t('dashboard.statsBlocks')}</p>
              <p className="text-2xl font-black text-white">{totalBlocks}</p>
              <div className="mt-2 text-[10px] text-primary-color font-bold flex items-center gap-1">
                <LayoutGrid className="w-3 h-3" /> {t('dashboard.statsBlocksHint')}
              </div>
            </div>
            <div className="bg-surface-elevated p-6 rounded-2xl border border-default/10">
              <p className="text-xs font-bold text-muted uppercase tracking-widest mb-1">{t('dashboard.statsServer')}</p>
              <p className="text-2xl font-black text-white">99.9%</p>
              <div className="mt-2 text-[10px] text-primary-color font-bold flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> {t('dashboard.statsServerHint')}
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm mb-6 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted">{t('dashboard.loadingPages')}</span>
              </div>
            </div>
          ) : filteredPages.length === 0 && pages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-surface-card border border-default/10 rounded-2xl flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">{t('dashboard.emptyTitle')}</h2>
              <p className="text-sm text-muted mb-6">{t('dashboard.emptyDescription')}</p>
              <button
                onClick={handleOpenCreate}
                disabled={isCreating}
                className="flex items-center gap-2 px-6 py-3 rounded-full text-black font-bold shadow-[0_16px_32px_-8px_rgba(37, 99, 235,0.3)] active:scale-95 transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(to right, #2563EB, #2563EB)' }}
              >
                {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                {t('dashboard.createPage')}
              </button>
            </div>
          ) : filteredPages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-sm text-muted">{t('dashboard.searchResult', { query: searchText })}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {filteredPages.map((page) => (
                <div
                  key={page.id}
                  className="group flex flex-col bg-surface-card rounded-2xl overflow-hidden hover:bg-surface-elevated transition-all duration-300 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)]"
                >
                  {/* Thumbnail area */}
                  <div
                    className="relative h-48 overflow-hidden cursor-pointer"
                    onClick={() => router.push(`/editor/${page.id}`)}
                  >
                    <div className="w-full h-full">
                      <PagePreviewThumbnail blocks={page.preview_blocks || []} themeId={page.theme_id} />
                    </div>
                    {/* Status badge */}
                    <div className="absolute top-4 left-4 z-10">
                      <span
                        className={`px-2 py-1 text-[10px] font-black tracking-widest rounded uppercase ${
                          page.status === 'published'
                            ? 'bg-primary text-white'
                            : 'bg-surface-card text-white'
                        }`}
                      >
                        {page.status === 'published' ? t('common.published').toUpperCase() : t('common.draft').toUpperCase()}
                      </span>
                    </div>
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-surface-card to-transparent opacity-60 pointer-events-none" />
                  </div>

                  {/* Card info */}
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <h3
                        className="text-lg font-bold text-white truncate cursor-pointer flex-1"
                        onClick={() => router.push(`/editor/${page.id}`)}
                      >
                        {page.name}
                      </h3>
                      {/* Menu */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === page.id ? null : page.id);
                          }}
                          className="text-muted hover:text-white transition-colors p-1"
                          aria-label={t('dashboard.pageOptions', { name: page.name })}
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>

                        {openMenuId === page.id && (
                          <div className="absolute right-0 top-8 w-44 bg-surface-elevated border border-default/30 rounded-xl shadow-2xl shadow-black/40 py-1 z-30">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/editor/${page.id}`);
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-card flex items-center gap-2"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              {t('dashboard.editPage')}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicate(page.id);
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-card flex items-center gap-2"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              {t('common.duplicate')}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`/preview/${page.id}`, '_blank');
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-card flex items-center gap-2"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              {t('dashboard.previewPage')}
                            </button>
                            {page.status === 'published' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(`/p/${page.slug}`, '_blank');
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-card flex items-center gap-2"
                              >
                                <Globe className="w-3.5 h-3.5" />
                                {t('dashboard.viewPublished')}
                              </button>
                            )}
                            <div className="border-t border-default/30 my-1" />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(page.id, page.name);
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {t('common.delete')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-6">
                      <p className="text-xs text-muted">/{page.slug}</p>
                      {page.is_shared && (
                        <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-primary\/10 border border-primary/20 text-primary-color font-medium">
                          <Users className="w-2.5 h-2.5" />
                          {page.owner_name}
                        </span>
                      )}
                    </div>

                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex items-center gap-2 text-muted">
                        <Layers className="w-4 h-4" />
                        <span className="text-xs font-medium">
                          {t('dashboard.blocksCount', { count: page.block_count || 0 })}
                        </span>
                      </div>
                      <button
                        onClick={() => router.push(`/editor/${page.id}`)}
                        className="w-8 h-8 rounded-full bg-surface-card flex items-center justify-center text-primary-color hover:bg-primary hover:text-black transition-all"
                        aria-label={t('dashboard.editPage')}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Mobile FAB */}
      <button
        onClick={handleOpenCreate}
        className="fixed bottom-8 right-8 w-14 h-14 bg-primary text-black rounded-full shadow-2xl flex items-center justify-center md:hidden active:scale-90 transition-transform"
        aria-label={t('dashboard.newPage')}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Click outside to close menu */}
      {openMenuId && (
        <div className="fixed inset-0 z-20" onClick={() => setOpenMenuId(null)} />
      )}

      <TemplatePickerModal
        open={showTemplatePicker}
        onClose={() => {
          if (!isCreating) setShowTemplatePicker(false);
        }}
        onSelect={handleCreateFromTemplate}
        onAIGenerate={() => setShowAIGenerate(true)}
        isCreating={isCreating}
      />

      <AIGenerateModal
        open={showAIGenerate}
        onClose={() => setShowAIGenerate(false)}
        onGenerated={(pageId) => router.push(`/editor/${pageId}`)}
      />
    </div>
  );
}
