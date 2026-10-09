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

// --- Core fetch with one refresh-and-retry on 401 ---

async function fetchWithRetry<T>(doFetch: () => Promise<Response>): Promise<T> {
  let res = await doFetch();

  if (res.status === 401 && (await refreshSession())) {
    res = await doFetch();
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// --- Request helpers ---

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string>) };
  return fetchWithRetry<T>(() => fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' }));
}

// --- Types ---

export interface ApiUser {
  id: string;
  email: string;
  username: string;
  avatar: string;
  created_at: string;
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
  blocks: Pick<ApiBlock, 'id' | 'type' | 'order' | 'data' | 'styles'>[];
  published_at: string | null;
  updated_at: string | null;
  show_watermark: boolean;
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
}

export interface ApiPage extends ApiSeoFields {
  id: string;
  name: string;
  slug: string;
  status: string;
  design_tokens?: Record<string, unknown> | null;
  blocks: ApiBlock[];
  published_at?: string | null;
  has_unpublished_changes?: boolean;
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

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ContactSubmitError';
    this.status = status;
    this.code = code;
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
  throw new ContactSubmitError(res.status, code, message);
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
    throw new Error(`API ${res.status}: ${text}`);
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

    /** Single-use, 30-second ticket to open the collaboration WebSocket. */
    wsTicket: () => request<{ ticket: string; expires_in: number }>('/auth/ws-ticket/', { method: 'POST' }),

    /** Revokes the refresh token and clears the session cookies on the server. */
    logout: async () => {
      const res = await fetch(`${API_BASE}/auth/logout/`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(`API ${res.status}: logout failed`);
    },
  },

  pages: {
    list: () => request<PaginatedResponse<ApiPageListItem>>('/pages/'),

    get: (id: string) => request<ApiPage>(`/pages/${id}/`),

    create: (data: Record<string, unknown>) =>
      request<ApiPage>('/pages/', { method: 'POST', body: JSON.stringify(data) }),

    update: (id: string, data: Record<string, unknown>) =>
      request<ApiPage>(`/pages/${id}/`, { method: 'PUT', body: JSON.stringify(data) }),

    delete: (id: string) =>
      request<void>(`/pages/${id}/`, { method: 'DELETE' }),

    duplicate: (id: string) =>
      request<ApiPage>(`/pages/${id}/duplicate/`, { method: 'POST' }),

    /** Freeze the saved draft as the public page (ADR-017). */
    publish: (id: string) => request<ApiPage>(`/pages/${id}/publish/`, { method: 'POST' }),

    unpublish: (id: string) => request<ApiPage>(`/pages/${id}/unpublish/`, { method: 'POST' }),

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

    collaborators: (id: string) =>
      request<{
        owner: { id: string; username: string; email: string };
        collaborators: Array<{ id: string; username: string; email: string }>;
      }>(`/pages/${id}/collaborators/`),
  },

  ai: {
    /** provider/api_key: the user's own key, used for this request only (never stored). */
    generate: (pageId: string, data: { prompt: string; tone?: string; language?: 'es' | 'en'; provider?: 'gemini' | 'anthropic'; api_key?: string }) =>
      request<{
        page_id: string;
        block_count: number;
        blocks: Array<{ id: string; type: string; order: number; data: Record<string, unknown>; styles: Record<string, unknown> }>;
        provider: string;
        tokens: { input: number; output: number; cost_estimate: string };
      }>(`/pages/${pageId}/generate/`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    editBlock: (pageId: string, blockId: string, instruction: string) =>
      request<{
        block: { id: string; type: string; order: number; data: Record<string, unknown>; styles: Record<string, unknown> };
        provider: string;
        tokens: { input: number; output: number; cost_estimate: string };
      }>(`/pages/${pageId}/blocks/${blockId}/edit-ai/`, {
        method: 'POST',
        body: JSON.stringify({ instruction }),
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
      request<{ subscription: ApiSubscription | null }>('/billing/subscription/'),

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

    restore: (pageId: string, versionId: string, restoreMetadata?: boolean) => {
      const qs = restoreMetadata ? '?restore_metadata=true' : '';
      return request<ApiPage>(`/pages/${pageId}/versions/${versionId}/restore/${qs}`, {
        method: 'POST',
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
