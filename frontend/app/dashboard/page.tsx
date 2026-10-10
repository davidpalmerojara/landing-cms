'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Plus, FileText, Loader2, AlertCircle, LogOut, FolderOpen, Settings, Search, Menu, X,
} from 'lucide-react';
import type { ApiUser } from '@/lib/api';
import { accountErrorMessage } from '@/lib/account-errors';
import { useAuth } from '@/hooks/useAuth';
import { loginRedirectFor } from '@/lib/login-redirect';
import { useBillingEnabled } from '@/hooks/useBillingEnabled';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePageActions } from '@/hooks/usePageActions';
import { usePageList } from '@/hooks/usePageList';
import { useSubscription } from '@/hooks/useSubscription';
import AIGenerateModal from '@/components/dashboard/AIGenerateModal';
import GuestLogoutDialog from '@/components/dashboard/GuestLogoutDialog';
import PageCard from '@/components/dashboard/PageCard';
import TemplatePickerModal from '@/components/dashboard/TemplatePickerModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import LocaleSwitcher from '@/components/ui/LocaleSwitcher';
import ThemeToggle from '@/components/ui/ThemeToggle';
import GuestSessionProvider, { useGuestSession } from '@/components/guest/GuestSessionProvider';
import GuestBanner from '@/components/guest/GuestBanner';

export default function DashboardPage() {
  const { user, setUser, isLoading, logout } = useAuth({ redirectTo: loginRedirectFor('/dashboard') });

  return (
    <GuestSessionProvider user={user} onClaimed={setUser}>
      <Dashboard user={user} isAuthLoading={isLoading} logout={logout} />
    </GuestSessionProvider>
  );
}

interface DashboardProps {
  user: ApiUser | null;
  isAuthLoading: boolean;
  logout: () => Promise<void>;
}

interface PendingConfirmation {
  kind: 'delete' | 'unpublish';
  id: string;
  name: string;
}

const SEARCH_DEBOUNCE_MS = 300;
const DRAWER_ID = 'dashboard-sidebar';

function Dashboard({ user, isAuthLoading, logout }: DashboardProps) {
  const t = useTranslations();
  const router = useRouter();
  const searchId = useId();
  const { isGuest, openClaim } = useGuestSession();
  const { billingEnabled } = useBillingEnabled();
  const { subscription, usage, refresh: refreshUsage } = useSubscription({ enabled: Boolean(user) });
  const plan = subscription?.plan ?? null;

  const [searchText, setSearchText] = useState('');
  const search = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS);
  const {
    pages, count, hasMore, isLoading, isLoadingMore, hasError: hasLoadError, error: loadFailure,
    loadMoreError, loadMore, reload, updatePages,
  } = usePageList(search);

  const refreshAll = useCallback(() => {
    reload();
    refreshUsage();
  }, [reload, refreshUsage]);

  const {
    actionError, createError, isCreating, clearErrors, createFromTemplate, duplicate, unpublish, remove,
  } = usePageActions({ onChanged: refreshUsage, updatePages, billingEnabled });

  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showAIGenerate, setShowAIGenerate] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [showGuestLogout, setShowGuestLogout] = useState(false);

  // Below lg the sidebar is a drawer; at lg and up it is always on screen
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const deletingRef = useRef(false);
  const [deleteSettled, setDeleteSettled] = useState(0);
  const drawerRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const isDrawerModal = drawerOpen && !isDesktop;
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useDialogFocus(drawerRef, isDrawerModal, closeDrawer);

  // Keep the page behind the open drawer from scrolling
  useEffect(() => {
    if (!isDrawerModal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isDrawerModal]);

  const sidebarNav = [
    { label: t('dashboard.sidebar.projects'), icon: FolderOpen, href: '/dashboard', active: true },
    { label: t('dashboard.sidebar.settings'), icon: Settings, href: '/settings', active: false },
  ];

  // Re-fetch when the tab becomes visible (e.g. returning from the editor)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshAll();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [refreshAll]);

  const handleOpenCreate = () => {
    clearErrors();
    setShowTemplatePicker(true);
  };

  const handleLogout = () => {
    // A guest's pages are deleted with the session: ask first and offer to keep them (QA-061)
    if (isGuest) setShowGuestLogout(true);
    else void logout();
  };

  const confirmPending = () => {
    if (!pendingConfirmation) return;
    const { kind, id } = pendingConfirmation;
    setPendingConfirmation(null);
    if (kind === 'delete') {
      deletingRef.current = true;
      void remove(id).finally(() => setDeleteSettled((count) => count + 1));
    } else {
      void unpublish(id);
    }
  };

  // A deleted card takes its menu button with it: keyboard focus would fall to the top of the page (APP2-003).
  // Once the list has been re-rendered without the card, the heading takes the focus.
  useEffect(() => {
    if (!deletingRef.current || deleteSettled === 0) return;
    deletingRef.current = false;
    if (document.activeElement === null || document.activeElement === document.body) headingRef.current?.focus();
  }, [deleteSettled, pages]);

  // Totals come from the server (the list is paginated); until they arrive, from the pages on screen when those are all of them
  const allLoaded = !hasMore && search.trim() === '';
  const localPublished = pages.filter((page) => page.status === 'published').length;
  const localBlocks = pages.reduce((sum, page) => sum + (page.block_count || 0), 0);
  const totalPages = usage?.visible_pages ?? (search.trim() === '' ? count : null);
  const publishedPages = usage?.published_pages ?? (allLoaded ? localPublished : null);
  const totalBlocks = usage?.blocks ?? (allLoaded ? localBlocks : null);
  const show = (value: number | null) => (value === null ? '–' : value);

  const ownedPages = usage?.pages ?? null;
  const isUnlimited = plan !== null && plan.max_pages === -1;
  const atPageLimit = !isGuest && plan !== null && !isUnlimited && ownedPages !== null && ownedPages >= plan.max_pages;
  const usageLabel = plan === null
    ? ''
    : isUnlimited
      ? t('dashboard.usageUnlimited', { current: ownedPages ?? 0 })
      : t('dashboard.usage', { current: ownedPages ?? 0, max: plan.max_pages });

  const loadError = hasLoadError ? accountErrorMessage(loadFailure, t, 'dashboard.loadError') : null;
  const bannerError = actionError ?? (loadMoreError ? accountErrorMessage(loadMoreError, t, 'dashboard.loadError') : null);
  const isSearching = search.trim() !== '';

  if (isAuthLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface text-secondary">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const newPageButtonClasses = 'flex items-center gap-2 px-6 py-3 min-h-11 rounded-full bg-primary hover:bg-primary-dark text-white font-bold shadow-lg shadow-primary/30 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div id="main-content" className="min-h-screen bg-surface text-primary">
      {/* Mobile sidebar overlay */}
      {isDrawerModal && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: a drawer below lg. Closed, it is inert so Tab and screen readers skip it */}
      <aside
        id={DRAWER_ID}
        ref={drawerRef}
        inert={!isDesktop && !drawerOpen}
        aria-label={t('navigation.menu')}
        className={`fixed left-0 top-0 h-full flex flex-col py-8 px-4 w-64 z-60 bg-surface border-r border-default/15 text-sm font-medium tracking-wide transform transition-transform duration-300 lg:translate-x-0 ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className="mb-10 px-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-black tracking-tighter text-primary-color">
            {t('common.brand')}
          </Link>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label={t('common.close')}
            className="lg:hidden w-11 h-11 -mr-3 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-card"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-2" aria-label={t('navigation.main')}>
          {sidebarNav.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={closeDrawer}
              aria-current={item.active ? 'page' : undefined}
              className={`flex items-center gap-3 px-4 py-3 min-h-11 rounded-lg transition-all duration-200 ${
                item.active
                  ? 'bg-surface-card text-primary-color shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]'
                  : 'text-muted hover:text-primary hover:bg-surface-card hover:translate-x-1'
              }`}
            >
              <item.icon className="w-5 h-5" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="mt-auto space-y-6">
          {/* Theme and language: the header hides them below md, so a phone finds them here */}
          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <LocaleSwitcher />
          </div>

          {/* Guest sessions have no plan to show: say what they are and how to keep the work */}
          {isGuest && (
            <div className="p-4 rounded-xl bg-surface-card border border-default/10">
              <p className="text-xs font-bold text-primary mb-1">{t('guest.cardTitle')}</p>
              <p className="text-xs text-muted mb-3">{t('guest.cardBody')}</p>
              <button
                type="button"
                onClick={openClaim}
                className="w-full min-h-11 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-dark rounded-full transition-all active:scale-95"
              >
                {t('guest.claimAction')}
              </button>
            </div>
          )}

          {/* Usage card: only rendered once the real plan and the real count are known */}
          {plan && ownedPages !== null && !isGuest && (
            <div className="p-4 rounded-xl bg-surface-card border border-default/10">
              <p className="text-xs font-bold text-primary mb-1">{t('dashboard.currentPlan', { plan: plan.display_name })}</p>
              <p className="text-xs text-muted mb-3">{usageLabel}</p>
              {!isUnlimited && (
                <div
                  className="h-1.5 w-full bg-surface-elevated rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={plan.max_pages}
                  aria-valuenow={Math.min(ownedPages, plan.max_pages)}
                  aria-label={usageLabel}
                >
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min((ownedPages / plan.max_pages) * 100, 100)}%` }}
                  />
                </div>
              )}
              {plan.name === 'free' && billingEnabled && (
                <button
                  type="button"
                  onClick={() => router.push('/settings/billing')}
                  className="mt-4 w-full min-h-11 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-dark rounded-full transition-all active:scale-95"
                >
                  {t('dashboard.upgradePlan')}
                </button>
              )}
            </div>
          )}

          <div className="space-y-1">
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2 min-h-11 text-muted hover:text-primary transition-colors w-full text-left"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
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
            ref={hamburgerRef}
            type="button"
            onClick={() => setDrawerOpen((open) => !open)}
            className="lg:hidden w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-card transition-all text-muted"
            aria-label={t('navigation.main')}
            aria-expanded={drawerOpen}
            aria-controls={DRAWER_ID}
          >
            {drawerOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
          </button>
          {/* Search: the server filters, so it reaches pages that are not loaded yet */}
          <div className="relative w-full max-w-xs lg:w-64">
            <label htmlFor={searchId} className="sr-only">{t('dashboard.searchPages')}</label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" aria-hidden="true" />
            <input
              id={searchId}
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t('dashboard.searchPages')}
              className="w-full min-h-11 bg-surface-elevated border-none rounded-lg pl-10 py-2 text-base sm:text-sm text-primary placeholder-muted focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-1">
            <ThemeToggle />
            <LocaleSwitcher />
          </div>
          <button
            type="button"
            onClick={() => router.push('/settings')}
            className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-card transition-all text-muted"
            aria-label={t('common.settings')}
          >
            <Settings className="w-5 h-5" aria-hidden="true" />
          </button>

          <div className="h-8 w-px bg-default/30 mx-2" />

          <div className="flex items-center gap-3 pl-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-primary">{user.username}</p>
              {isGuest ? (
                <p className="text-[10px] text-muted uppercase tracking-wider">{t('guest.cardTitle')}</p>
              ) : plan && (
                <p className="text-[10px] text-muted uppercase tracking-wider">{t('dashboard.currentPlan', { plan: plan.display_name })}</p>
              )}
            </div>
            <div className="w-10 h-10 rounded-full border-2 border-primary/20 bg-surface-card flex items-center justify-center text-sm font-bold text-primary-color" aria-hidden="true">
              {user.username?.charAt(0).toUpperCase() || 'U'}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="lg:ml-64 pt-24 pb-28 md:pb-12 px-4 lg:px-8 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <GuestBanner className="mb-8 rounded-xl border" />

          {/* Header section */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <h1 ref={headingRef} tabIndex={-1} className="text-3xl sm:text-4xl font-black tracking-tight mb-2 outline-none">{t('dashboard.title')}</h1>
              <p className="text-muted font-medium">
                {totalPages === null ? '…' : t('dashboard.pagesCount', { count: totalPages })}
                {' · '}
                {publishedPages === null ? '…' : t('dashboard.publishedCount', { count: publishedPages })}
              </p>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-2">
              <button
                type="button"
                onClick={handleOpenCreate}
                disabled={isCreating || atPageLimit}
                aria-describedby={atPageLimit ? 'page-limit-note' : undefined}
                className={newPageButtonClasses}
              >
                {isCreating ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Plus className="w-5 h-5" aria-hidden="true" />}
                <span>{t('dashboard.newPage')}</span>
              </button>
              {atPageLimit && (
                <p id="page-limit-note" className="text-xs text-muted max-w-xs sm:text-right">
                  {t(billingEnabled ? 'dashboard.planLimit' : 'dashboard.planLimitDemo')}
                </p>
              )}
            </div>
          </div>

          {/* Stats row */}
          <dl className="grid grid-cols-3 gap-3 sm:gap-6 mb-12">
            {[
              { label: t('dashboard.statsTotalPages'), value: show(totalPages) },
              { label: t('dashboard.statsPublished'), value: show(publishedPages) },
              { label: t('dashboard.statsBlocks'), value: show(totalBlocks) },
            ].map((stat) => (
              <div key={stat.label} className="bg-surface-elevated p-4 sm:p-6 rounded-2xl border border-default/10">
                <dt className="text-[10px] sm:text-xs font-bold text-muted uppercase tracking-wider sm:tracking-widest mb-1">{stat.label}</dt>
                <dd className="text-2xl font-black text-primary">{stat.value}</dd>
              </div>
            ))}
          </dl>

          {/* Errors of the last action or of loading more pages */}
          <div role="alert">
            {bannerError && (
              <div className="flex items-center gap-2 text-error text-sm mb-6 bg-error/10 border border-error/20 rounded-lg px-4 py-3">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                {bannerError}
              </div>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20" role="status">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted">{t('dashboard.loadingPages')}</span>
              </div>
            </div>
          ) : loadError ? (
            // A failed load is not "no pages yet": say what happened and offer a retry
            <div role="alert" className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-error/10 border border-error/20 rounded-2xl flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-error" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-bold text-primary mb-2">{loadError}</h2>
              <button
                type="button"
                onClick={reload}
                className="mt-4 min-h-11 px-6 rounded-full border border-default/30 text-sm font-bold text-primary hover:bg-surface-card transition-colors"
              >
                {t('common.retry')}
              </button>
            </div>
          ) : pages.length === 0 && !isSearching ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-surface-card border border-default/10 rounded-2xl flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-bold text-primary mb-2">{t('dashboard.emptyTitle')}</h2>
              <p className="text-sm text-muted mb-6">{t('dashboard.emptyDescription')}</p>
              <button type="button" onClick={handleOpenCreate} disabled={isCreating} className={newPageButtonClasses}>
                {isCreating ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Plus className="w-5 h-5" aria-hidden="true" />}
                {t('dashboard.createPage')}
              </button>
            </div>
          ) : pages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p role="status" className="text-sm text-muted">{t('dashboard.searchResult', { query: search.trim() })}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {pages.map((page) => (
                  <PageCard
                    key={page.id}
                    page={page}
                    onDuplicate={(id) => void duplicate(id)}
                    onUnpublish={(id, name) => setPendingConfirmation({ kind: 'unpublish', id, name })}
                    onDelete={(id, name) => setPendingConfirmation({ kind: 'delete', id, name })}
                  />
                ))}
              </div>
              {hasMore && (
                <div className="mt-10 flex justify-center">
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={isLoadingMore}
                    className="flex items-center gap-2 min-h-11 px-6 rounded-full border border-default/30 text-sm font-bold text-primary hover:bg-surface-card transition-colors disabled:opacity-50"
                  >
                    {isLoadingMore && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                    {t('dashboard.loadMore')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Mobile FAB */}
      <button
        type="button"
        onClick={handleOpenCreate}
        disabled={atPageLimit}
        className="fixed bottom-8 right-8 w-14 h-14 bg-primary text-white rounded-full shadow-2xl flex items-center justify-center md:hidden active:scale-90 transition-transform disabled:opacity-50"
        aria-label={t('dashboard.newPage')}
      >
        <Plus className="w-6 h-6" aria-hidden="true" />
      </button>

      <TemplatePickerModal
        open={showTemplatePicker}
        onClose={() => {
          if (!isCreating) setShowTemplatePicker(false);
        }}
        onSelect={(templateId) => void createFromTemplate(templateId)}
        onAIGenerate={() => setShowAIGenerate(true)}
        isCreating={isCreating}
        error={createError}
      />

      <AIGenerateModal
        open={showAIGenerate}
        onClose={() => setShowAIGenerate(false)}
        onGenerated={(pageId) => router.push(`/editor/${pageId}`)}
      />

      <ConfirmDialog
        open={pendingConfirmation !== null}
        title={pendingConfirmation?.kind === 'delete' ? t('dashboard.deleteTitle') : t('dashboard.unpublishTitle')}
        message={
          pendingConfirmation
            ? t(pendingConfirmation.kind === 'delete' ? 'dashboard.deleteConfirm' : 'dashboard.unpublishConfirm', {
              name: pendingConfirmation.name,
            })
            : ''
        }
        confirmLabel={pendingConfirmation?.kind === 'delete' ? t('common.delete') : t('dashboard.unpublish')}
        cancelLabel={t('common.cancel')}
        variant={pendingConfirmation?.kind === 'delete' ? 'danger' : 'default'}
        onConfirm={confirmPending}
        onCancel={() => setPendingConfirmation(null)}
      />

      {showGuestLogout && (
        <GuestLogoutDialog
          onCreateAccount={() => {
            setShowGuestLogout(false);
            openClaim();
          }}
          onLogout={() => {
            setShowGuestLogout(false);
            void logout();
          }}
          onCancel={() => setShowGuestLogout(false)}
        />
      )}
    </div>
  );
}
