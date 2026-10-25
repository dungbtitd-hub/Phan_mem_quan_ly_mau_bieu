import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode
} from 'react';
import { ApiError } from '../api/client';
import { VERSION_STATUS, detailMessages } from '../util';

// ===== Biểu tượng =====
const ICONS: Record<string, string> = {
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  check: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  log: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6v4H9z',
  chart: 'M12 20V10 M18 20V4 M6 20v-4',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  menu: 'M3 12h18 M3 6h18 M3 18h18',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3'
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {(ICONS[name] ?? '').split(' M').map((d, i) => <path key={i} d={i === 0 ? d : `M${d}`} />)}
    </svg>
  );
}

// ===== Nút =====
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'link';
  loading?: boolean;
  small?: boolean;
}
export function Button({ variant = 'secondary', loading, small, disabled, children, className = '', type = 'button', ...rest }: BtnProps) {
  return (
    <button type={type} className={`btn btn-${variant}${small ? ' btn-sm' : ''} ${className}`} disabled={disabled || loading}
      aria-busy={loading || undefined} {...rest}>
      {loading && <span className="spinner spinner-inline" aria-hidden="true" />}
      {children}
    </button>
  );
}

// ===== Trạng thái dữ liệu =====
export function Spinner({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return <div className="state" role="status"><span className="spinner" aria-hidden="true" /> {label}</div>;
}
export function EmptyState({ text = 'Không có dữ liệu', hint }: { text?: string; hint?: string }) {
  return <div className="state state-empty"><strong>{text}</strong>{hint && <span>{hint}</span>}</div>;
}
export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <strong>Không tải được dữ liệu</strong>
      <span>{error.message}</span>
      {error.requestId && <small>Mã yêu cầu: {error.requestId}</small>}
      {onRetry && <Button onClick={onRetry}>Thử lại</Button>}
    </div>
  );
}
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof ApiError ? error.message : 'Đã xảy ra lỗi không xác định';
  const details = detailMessages(error);
  return (
    <div className="alert alert-error" role="alert">
      <div>✕ {msg}</div>
      {details.length > 0 && <ul>{details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
      {error instanceof ApiError && error.requestId && <small>Mã yêu cầu: {error.requestId}</small>}
    </div>
  );
}

// ===== Huy hiệu trạng thái (có nhãn và biểu tượng, không chỉ dựa vào màu) =====
const BADGES: Record<string, [string, string, string]> = {
  active: ['ok', '●', 'Đang hiệu lực'], draft: ['muted', '○', 'Bản nháp'], pending: ['warn', '▲', 'Chờ phê duyệt'],
  expired: ['muted', '◌', 'Hết hiệu lực'], revoked: ['bad', '✕', 'Đã thu hồi'],
  locked: ['bad', '✕', 'Đã khóa'], disabled: ['muted', '○', 'Vô hiệu'], success: ['ok', '●', 'Thành công'], failure: ['bad', '✕', 'Thất bại']
};
export function StatusBadge({ status, kind }: { status: string; kind?: 'app' | 'user' | 'result' }) {
  let [cls, sym, label] = BADGES[status] ?? ['muted', '○', VERSION_STATUS[status] ?? status];
  if (kind === 'app' && status === 'active') label = 'Hoạt động';
  if (kind === 'user' && status === 'active') label = 'Hoạt động';
  return <span className={`badge badge-${cls}`}><span aria-hidden="true">{sym}</span> {label}</span>;
}

// ===== Thông báo =====
interface Toast { id: number; kind: 'success' | 'error'; text: string }
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems(s => [...s, { id, kind, text }]);
    setTimeout(() => setItems(s => s.filter(t => t.id !== id)), 6000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {items.map(t => <div key={t.id} className={`toast toast-${t.kind}`}>{t.kind === 'success' ? '✓' : '✕'} {t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// ===== Hộp thoại =====
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const f = ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Đóng">✕</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, danger, withReason, onConfirm, onClose }: {
  title: string; message: ReactNode; confirmLabel: string; danger?: boolean; withReason?: boolean;
  onConfirm: (reason: string) => Promise<void>; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [reason, setReason] = useState('');
  const run = async () => {
    if (busy) return;
    if (withReason && reason.trim().length < 3) { setErr(new ApiError(400, 'VALIDATION_ERROR', 'Vui lòng nhập lý do (ít nhất 3 ký tự)')); return; }
    setBusy(true); setErr(null);
    try { await onConfirm(reason.trim()); onClose(); } catch (e) { setErr(e); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={() => { if (!busy) onClose(); }}>
      <div className="stack">
        <div>{message}</div>
        {withReason && <Field label="Lý do" required><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={1000} /></Field>}
        <ErrorBox error={err} />
        <div className="actions">
          <Button onClick={onClose} disabled={busy}>Hủy</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={run} loading={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ===== Biểu mẫu =====
export function Field({ label, htmlFor, required, hint, error, children }: {
  label: string; htmlFor?: string; required?: boolean; hint?: string; error?: string | null; children: ReactNode;
}) {
  return (
    <div className={`field${error ? ' field-error' : ''}`}>
      <label htmlFor={htmlFor}>{label}{required && <span className="req" aria-hidden="true"> *</span>}</label>
      {children}
      {hint && !error && <small className="hint">{hint}</small>}
      {error && <small className="err" role="alert">{error}</small>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="pagination" aria-label="Phân trang">
      <span>Hiển thị {from}–{to} / {total}</span>
      <div>
        <Button small disabled={page <= 1} onClick={() => onChange(page - 1)}>‹ Trước</Button>
        <span className="page-no">Trang {page}/{pages}</span>
        <Button small disabled={page >= pages} onClick={() => onChange(page + 1)}>Sau ›</Button>
      </div>
    </nav>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="page-head"><h1>{title}</h1><div className="actions">{children}</div></div>;
}

export function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: 'warn' }) {
  return <div className={`card stat${tone ? ` stat-${tone}` : ''}`}><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>;
}

/** Biểu đồ cột dạng danh sách: giá trị luôn có dạng chữ nên không phụ thuộc vào màu. */
export function BarList({ items, empty = 'Chưa có dữ liệu' }: { items: { label: string; value: number }[]; empty?: string }) {
  if (items.length === 0) return <EmptyState text={empty} />;
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <ul className="barlist">
      {items.map((i, idx) => (
        <li key={idx}>
          <span className="bl-label" title={i.label}>{i.label}</span>
          <span className="bl-track" aria-hidden="true"><span style={{ width: `${(i.value / max) * 100}%` }} /></span>
          <span className="bl-value">{i.value}</span>
        </li>
      ))}
    </ul>
  );
}
