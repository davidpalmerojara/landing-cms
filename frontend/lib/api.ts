const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

// --- Session ---
// The JWTs live only in httpOnly cookies set by the backend (ADR-008):
// JavaScript never sees them, so an XSS cannot read them. Every request
// sends the cookies with credentials: 'include'.

// Earlier versions copied the tokens into localStorage; remove those copies.
const LEGACY_TOKEN_KEYS = ['paxl_access_token', 'paxl_refresh_token'];
if (typeof window !== 'undefined') {
  try {
    LEGACY_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage blocked (private mode, disabled cookies): nothing to clean up
  }
}

let refreshPromise: Promise<boolean> | null = null;

/** Ask the backend to rotate the session cookies. Resolves false if the session is gone. */
async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh/`, { method: 'POST', credentials: 'include' });
    return res.ok;
  } catch {
    // Network error: treat as no session; the original request reports the failure
    return false;
  }
}

function refreshSession(): Promise<boolean> {
  // Concurrent 401s share a single refresh request
  if (!refreshPromise) refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

// --- Errors ---

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A non-2xx API response. `message` keeps the historical `API <status>: <body>`
 * format; `code` and `details` come from the backend's `{ error, code, details }` body.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  /** Field-level validation errors: `{ field: [messages] }` */
  readonly details: Record<string, string[]> | null;
  /** The parsed JSON body, when it is an object (e.g. the `page` of a 409 VERSION_CONFLICT) */
  readonly body: Record<string, unknown> | null;

  constructor(status: number, body: string) {
    super(`API ${status}: ${body}`);
    this.name = 'ApiError';
    this.status = status;

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      // The body is not JSON (a proxy page, plain text): only the status is known
    }
    const record = isJsonObject(parsed) ? parsed : null;
    this.code = record && typeof record.code === 'string' ? record.code : null;
    this.details = record && isJsonObject(record.details) ? toFieldErrors(record.details) : null;
    this.body = record;
  }
}

function toFieldErrors(details: Record<string, unknown>): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const [field, value] of Object.entries(details)) {
    const messages = Array.isArray(value) ? value : [value];
    fields[field] = messages.filter((m): m is string => typeof m === 'string');
  }
  return fields;
}

/** The backend error code of a failed request (e.g. 'GUEST_CAPACITY'), or null. */
export function apiErrorCode(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null;
}

/** The request needs a plan the user does not have (403 with `{ error: 'plan_limit' }`). */
export function isPlanLimitError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && error.body?.error === 'plan_limit';
}

/** The server's current page sent with a 409 VERSION_CONFLICT, or null for any other error. */
export function conflictPage(error: unknown): ApiPage | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== 'VERSION_CONFLICT') return null;
  const page = error.body?.page;
  if (!isJsonObject(page) || typeof page.id !== 'string' || typeof page.version !== 'number' || !Array.isArray(page.blocks)) {
    return null;
  }
  // Checked above: an object with the identifying fields of a PageDetail
  return page as unknown as ApiPage;
}

// --- Core fetch with one refresh-and-retry on 401 ---

async function fetchWithRetry<T>(doFetch: () => Promise<Response>): Promise<T> {
  let res = await doFetch();

  if (res.status === 401 && (await refreshSession())) {
    res = await doFetch();
  }

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// --- Request helpers ---

/** Header that tells the server which collaboration socket made a change, so it can skip the echo. */
function connectionHeaders(connectionId?: string | null): Record<string, string> {
  return connectionId ? { 'X-Connection-Id': connectionId } : {};
}

/** Browsers refuse keepalive requests whose bodies add up to more than 64 KB; leave room for others. */
const KEEPALIVE_MAX_BODY = 60_000;

/**
 * The interface language, which the server uses for validation messages and
 * emails (Accept-Language). `<html lang>` always holds it: the server sets it
 * from the locale and the language switcher updates it.
 */
function interfaceLanguage(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const lang = document.documentElement.lang;
  return lang === 'es' || lang === 'en' ? { 'Accept-Language': lang } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...interfaceLanguage(),
    ...(options?.headers as Record<string, string>),
  };
  return fetchWithRetry<T>(() => fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' }));
}

// --- Types ---

export interface ApiUser {
  id: string;
  email: string;
  username: string;
  avatar: string;
  created_at: string;
  /** False for magic-link and Google accounts: they confirm a deletion with their username */
  has_password: boolean;
  /** Temporary "try it without signing up" account */
  is_guest: boolean;
  /** When a guest session is deleted (ISO date); null for normal accounts */
  expires_at: string | null;
}

export interface AuthResponse {
  user: ApiUser;
  /** Present when this sign-in proved the email and turned off a password that was never confirmed */
  password_disabled?: boolean;
}

/** GET /api/public/pages/{slug}/: the copy frozen at publish time (ADR-017). */
export interface ApiPublicPage {
  id: string;
  slug: string;
  status: string;
  name: string;
  design_tokens?: Record<string, unknown> | null;
  seo_title?: string;
  seo_description?: string;
  seo_canonical_url?: string;
  og_title?: string;
  og_description?: string;
  og_image?: string;
  og_type?: string;
  noindex?: boolean;
  /** BCP 47 tag of the language the page is written in (ADR-033); frozen with the published copy */
  language?: string;
  blocks: Pick<ApiBlock, 'id' | 'type' | 'order' | 'data' | 'styles'>[];
  published_at: string | null;
  updated_at: string | null;
  show_watermark: boolean;
  /** Published by a temporary guest: shown with a notice, the form doesn't send */
  is_guest_page?: boolean;
}

/** GET /api/features/: what this deployment offers (custom domains need DNS and SSL, which not every host has). */
export interface ApiFeatures {
  custom_domains: boolean;
  /** Payments run only with a Stripe test key (ADR-036): without one the billing endpoints answer 503 */
  billing: boolean;
}

export interface ApiBlock {
  id: string;
  type: string;
  order: number;
  data: Record<string, unknown>;
  styles: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ApiSeoFields {
  seo_title: string;
  seo_description: string;
  seo_canonical_url: string;
  og_title: string;
  og_description: string;
  og_image: string;
  og_type: string;
  noindex: boolean;
  /** BCP 47 tag of the language the page is written in (ADR-033). Absent from older servers. */
  language?: string;
}

export interface ApiPage extends ApiSeoFields {
  id: string;
  /** Bumped by every write; a PUT must send the version it is based on (409 otherwise) */
  version: number;
  name: string;
  slug: string;
  status: string;
  design_tokens?: Record<string, unknown> | null;
  blocks: ApiBlock[];
  published_at?: string | null;
  has_unpublished_changes?: boolean;
  /** The user asking owns the page (publish, unpublish, share are the owner's). Absent from older servers. */
  is_owner?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiPreviewBlock {
  id: string;
  type: string;
  order: number;
  data: Record<string, unknown>;
}

export interface ApiPageListItem extends ApiSeoFields {
  id: string;
  name: string;
  slug: string;
  status: string;
  design_tokens?: Record<string, unknown> | null;
  block_count: number;
  owner_name?: string;
  is_shared?: boolean;
  preview_blocks: ApiPreviewBlock[];
  published_at?: string | null;
  has_unpublished_changes?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiAsset {
  id: string;
  name: string;
  url: string;
  mime_type: string;
  size: number;
  created_at: string;
}

// --- AI ---

/** Where an AI answer came from: a saved demo response, the server's key, or the user's own key. */
export type AiSource = 'demo' | 'live' | 'own_key';

/** Why a saved response was served. */
export type AiDemoReason = 'demo_mode' | 'daily_limit' | 'provider_quota';

export interface AiDemoInfo {
  reason: AiDemoReason;
  /** Where the saved answers come from: real model output, or written by hand */
  origin?: 'generated' | 'placeholder';
  /** Page generation only: the saved page served, and whether the text matched it (false: a fallback) */
  fixture_id?: string;
  matched?: boolean;
}

export interface AiOwnKey {
  provider?: 'gemini' | 'anthropic';
  api_key?: string;
}

export interface AiPromptSuggestion {
  id: string;
  title: string;
  prompt: string;
  language: 'es' | 'en';
}

export interface AiOptions {
  mode: 'demo' | 'live' | 'unavailable';
  live_user_daily_limit: number;
  prompts: AiPromptSuggestion[];
}

interface AiAnswer {
  source: AiSource;
  provider: string | null;
  /** Only when source is "demo" */
  demo?: AiDemoInfo;
  tokens: { input: number; output: number; cost_estimate: string };
}

export interface AiGenerateResponse extends AiAnswer {
  page_id: string;
  block_count: number;
  blocks: Array<{ id: string; type: string; order: number; data: Record<string, unknown>; styles: Record<string, unknown> }>;
}

export interface AiEditBlockResponse extends AiAnswer {
  block: { id: string; type: string; order: number; data: Record<string, unknown>; styles: Record<string, unknown> };
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ApiFormSubmission {
  id: string;
  block_id: string | null;
  name: string;
  email: string;
  message: string;
  created_at: string;
}

export interface ContactFormPayload {
  name: string;
  email: string;
  message: string;
  /** Honeypot: humans never fill it in. */
  website: string;
  block_id?: string;
}

/** Failure of the public contact form, with the HTTP status and the backend's error code. */
export class ContactSubmitError extends Error {
  readonly status: number;
  readonly code: string;
  /** Form fields the server rejected (keys of `details` in a 400), e.g. ['email'] */
  readonly fields: string[];

  constructor(status: number, code: string, message: string, fields: string[] = []) {
    super(message);
    this.name = 'ContactSubmitError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Public request: no cookies, so a logged-in owner and a visitor are treated alike. */
async function submitContactRequest(slug: string, payload: ContactFormPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/public/pages/${encodeURIComponent(slug)}/contact/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'omit',
  });
  if (res.ok) return;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // The error body is optional; the status alone is enough to react
  }
  const message = isRecord(body) && typeof body.error === 'string' ? body.error : `API ${res.status}`;
  const code = isRecord(body) && typeof body.code === 'string' ? body.code : 'ERROR';
  const fields = isRecord(body) && isRecord(body.details) ? Object.keys(body.details) : [];
  throw new ContactSubmitError(res.status, code, message, fields);
}

// --- API methods ---

async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  return fetchWithRetry<T>(
    () => fetch(`${API_BASE}${path}`, { method: 'POST', body: formData, credentials: 'include' }),
  );
}

async function publicRequest<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    register: async (data: { username: string; email: string; password: string; password2: string }) => {
      const res = await request<AuthResponse>('/auth/register/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res;
    },

    login: async (data: { username: string; password: string }) => {
      return request<{ message: string }>('/auth/login/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    googleLogin: async (token: string) => {
      const res = await request<AuthResponse>('/auth/google/', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      return res;
    },

    magicRequest: async (email: string) => {
      return request<{ message: string }>('/auth/magic/request/', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    },

    magicVerify: async (token: string) => {
      const res = await request<AuthResponse>('/auth/magic/verify/', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      return res;
    },

    me: () => request<ApiUser>('/auth/me/'),

    /** Starts a temporary guest session (httpOnly cookies, like any login). */
    guest: () => request<AuthResponse>('/auth/guest/', { method: 'POST', body: '{}' }),

    /** A guest signs up and keeps its pages; the session cookies are replaced. */
    claimGuest: (data: { username: string; email: string; password: string; password2: string }) =>
      request<AuthResponse>('/auth/guest/claim/', { method: 'POST', body: JSON.stringify(data) }),

    /** Opens a page from an invite link: adds the user (a new guest when signed out) as collaborator. */
    join: (token: string) =>
      request<{ page_id: string; user: ApiUser }>('/auth/join/', { method: 'POST', body: JSON.stringify({ token }) }),

    /** Single-use, 30-second ticket to open the collaboration WebSocket. */
    wsTicket: () => request<{ ticket: string; expires_in: number }>('/auth/ws-ticket/', { method: 'POST' }),

    /** Revokes the refresh token and clears the session cookies on the server. */
    logout: async () => {
      const res = await fetch(`${API_BASE}/auth/logout/`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(`API ${res.status}: logout failed`);
    },

    /**
     * Deletes the account and everything it owns. A password account sends its
     * current password; one without a password types its username instead.
     * The server clears the session cookies.
     */
    deleteAccount: (data: { password?: string; confirm_username?: string }) =>
      request<void>('/auth/me/', { method: 'DELETE', body: JSON.stringify(data) }),
  },

  pages: {
    /** One page of the list (20 per page). `search` filters by name or slug on the server. */
    list: (params: { page?: number; search?: string } = {}) => {
      const query = new URLSearchParams();
      if (params.page && params.page > 1) query.set('page', String(params.page));
      if (params.search?.trim()) query.set('search', params.search.trim());
      const qs = query.toString();
      return request<PaginatedResponse<ApiPageListItem>>(`/pages/${qs ? `?${qs}` : ''}`);
    },

    get: (id: string) => request<ApiPage>(`/pages/${id}/`),

    create: (data: Record<string, unknown>) =>
      request<ApiPage>('/pages/', { method: 'POST', body: JSON.stringify(data) }),

    /**
     * `data.version` must be the version the edit is based on; a stale one gets 409 VERSION_CONFLICT.
     * `keepalive`: the request outlives the tab (sent while leaving the page); browsers
     * cap such bodies at 64 KB, so a larger page is sent as a normal request.
     */
    update: (id: string, data: Record<string, unknown>, connectionId?: string | null, options: { keepalive?: boolean } = {}) => {
      const body = JSON.stringify(data);
      return request<ApiPage>(`/pages/${id}/`, {
        method: 'PUT',
        body,
        headers: connectionHeaders(connectionId),
        keepalive: Boolean(options.keepalive) && new TextEncoder().encode(body).length < KEEPALIVE_MAX_BODY,
      });
    },

    delete: (id: string) =>
      request<void>(`/pages/${id}/`, { method: 'DELETE' }),

    duplicate: (id: string) =>
      request<ApiPage>(`/pages/${id}/duplicate/`, { method: 'POST' }),

    /** Freeze the saved draft as the public page (ADR-017). */
    publish: (id: string, connectionId?: string | null) =>
      request<ApiPage>(`/pages/${id}/publish/`, { method: 'POST', headers: connectionHeaders(connectionId) }),

    /** Take the public copy offline (owner only). */
    unpublish: (id: string, connectionId?: string | null) =>
      request<ApiPage>(`/pages/${id}/unpublish/`, { method: 'POST', headers: connectionHeaders(connectionId) }),

    share: (id: string, email: string) =>
      request<{ message: string }>(`/pages/${id}/share/`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),

    unshare: (id: string, userId: string) =>
      request<{ message: string }>(`/pages/${id}/unshare/`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      }),

    /** Owner only: a link that lets whoever opens it edit the page (24 h, a few uses). */
    invite: (id: string) =>
      request<{ token: string; path: string; expires_at: string }>(`/pages/${id}/invite/`, { method: 'POST' }),

    collaborators: (id: string) =>
      request<{
        owner: { id: string; username: string; email: string };
        collaborators: Array<{ id: string; username: string; email: string }>;
      }>(`/pages/${id}/collaborators/`),
  },

  ai: {
    /** How AI answers right now, and the saved prompts offered as suggestions (titled in `language`). */
    options: (language: 'es' | 'en') =>
      request<AiOptions>(`/ai/options/?language=${language}`),

    /** provider/api_key: the user's own key, used for this request only (never stored). */
    generate: (pageId: string, data: { prompt: string; tone?: string; language?: 'es' | 'en' } & AiOwnKey) =>
      request<AiGenerateResponse>(`/pages/${pageId}/generate/`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    /** connectionId: this editor's socket, which holds the block's lock while it is selected (else 409 BLOCK_LOCKED). */
    editBlock: (pageId: string, blockId: string, instruction: string, ownKey?: AiOwnKey, connectionId?: string | null) =>
      request<AiEditBlockResponse>(`/pages/${pageId}/blocks/${blockId}/edit-ai/`, {
        method: 'POST',
        headers: connectionHeaders(connectionId),
        body: JSON.stringify({ instruction, ...ownKey }),
      }),
  },

  assets: {
    list: () => request<PaginatedResponse<ApiAsset>>('/assets/'),

    upload: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return uploadRequest<ApiAsset>('/assets/', formData);
    },

    delete: (id: string) =>
      request<void>(`/assets/${id}/`, { method: 'DELETE' }),
  },

  analytics: {
    get: (pageId: string, params?: { period?: string; granularity?: string; start?: string; end?: string }) => {
      const sp = new URLSearchParams();
      if (params?.period) sp.set('period', params.period);
      if (params?.granularity) sp.set('granularity', params.granularity);
      if (params?.start) sp.set('start', params.start);
      if (params?.end) sp.set('end', params.end);
      const qs = sp.toString();
      return request<AnalyticsData>(`/pages/${pageId}/analytics/${qs ? `?${qs}` : ''}`);
    },
  },

  billing: {
    plans: () => publicRequest<ApiBillingPlan[]>('/billing/plans/'),

    subscription: () =>
      request<{ subscription: ApiSubscription | null; usage?: ApiUsage }>('/billing/subscription/'),

    payments: () =>
      request<{ payments: ApiPayment[] }>('/billing/payments/'),

    checkout: (cycle: 'monthly' | 'yearly') =>
      request<{ checkout_url: string }>('/billing/checkout/', {
        method: 'POST',
        body: JSON.stringify({ cycle }),
      }),

    portal: () =>
      request<{ portal_url: string }>('/billing/portal/', {
        method: 'POST',
      }),
  },

  versions: {
    list: (pageId: string, page?: number) => {
      const qs = page && page > 1 ? `?page=${page}` : '';
      return request<PaginatedResponse<ApiPageVersion>>(`/pages/${pageId}/versions/${qs}`);
    },

    get: (pageId: string, versionId: string) =>
      request<ApiPageVersionDetail>(`/pages/${pageId}/versions/${versionId}/`),

    create: (pageId: string, label?: string) =>
      request<ApiPageVersion>(`/pages/${pageId}/versions/`, {
        method: 'POST',
        body: JSON.stringify({ label: label || '' }),
      }),

    updateLabel: (pageId: string, versionId: string, label: string) =>
      request<ApiPageVersion>(`/pages/${pageId}/versions/${versionId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ label }),
      }),

    delete: (pageId: string, versionId: string) =>
      request<void>(`/pages/${pageId}/versions/${versionId}/`, { method: 'DELETE' }),

    restore: (pageId: string, versionId: string, restoreMetadata?: boolean, connectionId?: string | null) => {
      const qs = restoreMetadata ? '?restore_metadata=true' : '';
      return request<ApiPage>(`/pages/${pageId}/versions/${versionId}/restore/${qs}`, {
        method: 'POST',
        headers: connectionHeaders(connectionId),
      });
    },
  },

  domains: {
    list: () => request<PaginatedResponse<ApiCustomDomain>>('/domains/'),

    get: (id: string) => request<ApiCustomDomain>(`/domains/${id}/`),

    create: (data: { domain: string; page?: string }) =>
      request<ApiCustomDomain>('/domains/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: { page?: string | null }) =>
      request<ApiCustomDomain>(`/domains/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<void>(`/domains/${id}/`, { method: 'DELETE' }),

    verify: (id: string) =>
      request<ApiCustomDomain & { dns_error?: string }>(`/domains/${id}/verify/`, {
        method: 'POST',
      }),
  },

  features: {
    /** Optional features the deployment has turned on. */
    get: () => publicRequest<ApiFeatures>('/features/'),
  },

  public: {
    getBySlug: (slug: string) => publicRequest<ApiPublicPage>(`/public/pages/${encodeURIComponent(slug)}/`),
    submitContact: submitContactRequest,
  },

  submissions: {
    list: (pageId: string, page = 1) =>
      request<PaginatedResponse<ApiFormSubmission>>(`/pages/${pageId}/submissions/?page=${page}`),

    delete: (pageId: string, submissionId: string) =>
      request<void>(`/pages/${pageId}/submissions/${submissionId}/`, { method: 'DELETE' }),
  },
};

// --- Billing types ---

export interface ApiCustomDomain {
  id: string;
  domain: string;
  page: string | null;
  page_name: string;
  dns_status: 'pending' | 'verified' | 'failed';
  dns_verified_at: string | null;
  ssl_status: 'pending' | 'provisioning' | 'active' | 'expired' | 'failed';
  ssl_provisioned_at: string | null;
  ssl_expires_at: string | null;
  last_dns_check_at: string | null;
  is_active: boolean;
  dns_instructions: {
    cname: { type: string; name: string; value: string; ttl: number };
    alternative_a_record: { type: string; name: string; value: string };
  };
  created_at: string;
  updated_at: string;
}

export interface ApiBillingPlan {
  id: string;
  name: string;
  display_name: string;
  price_monthly: string;
  price_yearly: string | null;
  max_pages: number;
  max_ai_generations_per_hour: number;
  has_analytics: boolean;
  has_collaboration: boolean;
  has_custom_domain: boolean;
  has_ab_testing: boolean;
  remove_watermark: boolean;
  max_version_history: number;
}

export interface ApiSubscription {
  id: string;
  plan: ApiBillingPlan;
  status: 'free' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
  billing_cycle: 'monthly' | 'yearly' | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  created_at: string;
}

/** Totals for the dashboard: `pages` is what the plan limit counts (owned only), the rest covers every page the list shows. */
export interface ApiUsage {
  pages: number;
  visible_pages: number;
  published_pages: number;
  blocks: number;
}

export interface ApiPayment {
  id: string;
  amount: string;
  currency: string;
  status: 'paid' | 'failed' | 'refunded';
  invoice_url: string;
  created_at: string;
}

export interface ApiPageVersion {
  id: string;
  version_number: number;
  trigger: 'manual' | 'auto_publish' | 'auto_restore' | 'auto_ai_generation';
  label: string;
  created_by: string;
  created_by_name: string;
  size_bytes: number;
  created_at: string;
}

export interface ApiPageVersionDetail extends ApiPageVersion {
  snapshot: Array<{
    id: string;
    type: string;
    order: number;
    data: Record<string, unknown>;
    styles: Record<string, unknown>;
  }>;
  page_metadata: {
    name: string;
    slug: string;
    status: string;
    // Present in snapshots taken since design tokens and SEO were added
    design_tokens?: Record<string, unknown>;
    seo_title?: string;
    seo_description?: string;
  };
}

export interface AnalyticsData {
  total_views: number;
  unique_visitors: number;
  avg_time_on_page: number;
  bounce_rate: number;
  cta_conversions: number;
  prev_total_views: number;
  prev_unique_visitors: number;
  prev_cta_conversions: number;
  views_over_time: Array<{ date: string; views: number; unique_visitors: number }>;
  clicks_by_block: Array<{ block_id: string | null; block_type: string | null; click_count: number; ctr: number }>;
  scroll_depth_distribution: Record<number, number>;
  top_referrers: Array<{ referrer: string; count: number }>;
  device_breakdown: { desktop: number; tablet: number; mobile: number };
  period: { start: string; end: string };
}
