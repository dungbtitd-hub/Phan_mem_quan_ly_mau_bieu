import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api/client';

export function fmtDate(v?: string | null): string {
  if (!v) return '—';
  const [y, m, d] = v.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function fmtDateTime(v?: string | null): string {
  if (!v) return '—';
  const iso = /[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v}Z`;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(iso));
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function todayIso(offsetDays = 0): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000 + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

export const ROLE_LABELS: Record<string, string> = { admin: 'Quản trị viên', approver: 'Người phê duyệt', user: 'Người dùng' };
export const VERSION_STATUS: Record<string, string> = {
  draft: 'Bản nháp', pending: 'Chờ phê duyệt', active: 'Đang hiệu lực', expired: 'Hết hiệu lực', revoked: 'Đã thu hồi'
};
export const MAX_UPLOAD = 30 * 1024 * 1024;
export const ALLOWED_EXT = ['docx', 'xlsx', 'pdf', 'doc', 'xls'];

export function checkFile(f: File | null): string | null {
  if (!f) return 'Vui lòng chọn tệp';
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXT.includes(ext)) return `Chỉ chấp nhận tệp: ${ALLOWED_EXT.join(', ')}`;
  if (f.size === 0) return 'Tệp rỗng';
  if (f.size > MAX_UPLOAD) return 'Tệp vượt quá 30 MB';
  return null;
}

/** Trả về danh sách thông báo lỗi chi tiết (nếu máy chủ gửi kèm theo từng trường). */
export function detailMessages(e: unknown): string[] {
  if (!(e instanceof ApiError) || !e.details || typeof e.details !== 'object') return [];
  return Object.values(e.details as Record<string, unknown>).flatMap(v => (Array.isArray(v) ? v.map(String) : [String(v)]));
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: ApiError | null }>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState(s => ({ ...s, loading: true, error: null }));
    fn().then(d => { if (alive) setState({ data: d, loading: false, error: null }); })
      .catch(e => { if (alive) setState({ data: null, loading: false, error: e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', String(e)) }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  return { ...state, reload };
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
