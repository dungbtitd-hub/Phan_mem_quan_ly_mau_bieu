export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown, public requestId?: string) {
    super(message);
  }
}

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: { code: string; message: string; details?: unknown; requestId?: string } | null;
}

let onUnauthorized: () => void = () => undefined;
export function setUnauthorizedHandler(h: () => void) { onUnauthorized = h; }

let csrfToken: string | null = null;
export function resetCsrf() { csrfToken = null; }

async function csrf(force = false): Promise<string> {
  if (force || !csrfToken) {
    const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    if (!res.ok) throw new ApiError(res.status, 'CSRF', 'Không lấy được mã bảo vệ phiên làm việc');
    const j = (await res.json()) as Envelope<{ token: string }>;
    csrfToken = j.data.token;
  }
  return csrfToken as string;
}

function friendly(status: number, fallback: string): string {
  if (status === 429) return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
  if (status === 413) return 'Tệp vượt quá dung lượng cho phép (30 MB).';
  if (status === 502 || status === 503 || status === 504) return 'Máy chủ tạm thời không phản hồi. Vui lòng thử lại sau.';
  return fallback;
}

async function request<T>(method: string, url: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  if (method !== 'GET') headers['X-CSRF-TOKEN'] = await csrf();

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.');
  }
  const text = await res.text();
  let env: Envelope<T> | null = null;
  if (text) { try { env = JSON.parse(text) as Envelope<T>; } catch { env = null; } }

  if (!res.ok) {
    // Lỗi antiforgery của framework trả 400 không có thân JSON: làm mới token và thử lại một lần
    if (method !== 'GET' && res.status === 400 && !env && retry) { await csrf(true); return request<T>(method, url, body, false); }
    if (res.status === 401 && !url.startsWith('/api/auth/login')) onUnauthorized();
    throw new ApiError(res.status, env?.error?.code ?? `HTTP_${res.status}`,
      friendly(res.status, env?.error?.message ?? env?.message ?? `Lỗi ${res.status}`), env?.error?.details, env?.error?.requestId);
  }
  return (env?.data ?? null) as T;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const api = {
  get: <T,>(url: string) => request<T>('GET', url),
  post: <T,>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T,>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  form: <T,>(method: 'POST' | 'PUT', url: string, data: FormData) => request<T>(method, url, data)
};

/** Lấy toàn bộ các trang của một danh sách phân trang (tối đa 20 trang). */
export async function fetchAll<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 20; page++) {
    const sep = url.includes('?') ? '&' : '?';
    const r = await api.get<{ items: T[]; total: number }>(`${url}${sep}page=${page}&pageSize=100`);
    out.push(...r.items);
    if (out.length >= r.total || r.items.length === 0) break;
  }
  return out;
}

function fileNameFrom(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (star) { try { return decodeURIComponent(star[1]); } catch { /* bỏ qua */ } }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1] : fallback;
}

/** Tải tệp qua fetch để mang theo cookie phiên và hiển thị lỗi đúng định dạng thay vì mở trang JSON. */
export async function downloadFile(url: string): Promise<void> {
  let res: Response;
  try { res = await fetch(url, { credentials: 'same-origin' }); }
  catch { throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Vui lòng thử lại.'); }
  if (!res.ok) {
    let msg = `Không tải được tệp (lỗi ${res.status})`;
    let code = `HTTP_${res.status}`;
    try { const j = (await res.json()) as Envelope<unknown>; msg = j.error?.message ?? msg; code = j.error?.code ?? code; } catch { /* không có JSON */ }
    if (res.status === 401) onUnauthorized();
    throw new ApiError(res.status, code, friendly(res.status, msg));
  }
  const blob = await res.blob();
  const name = fileNameFrom(res.headers.get('Content-Disposition'), 'mau-bieu');
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}
