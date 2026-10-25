import { useEffect, useState } from 'react';

// Nhận diện do đơn vị đặt trên máy chủ (thư mục branding/ cạnh docker-compose.yml), không đóng gói vào bản build:
//   logo.svg | logo.png | logo.webp | logo.jpg  — thử lần lượt; không có tệp nào thì hiển thị ô giữ chỗ "LOGO".
//   config.json  — { "unitLines": ["Chi nhánh ...", "Phòng ..."] } hiển thị dưới logo.
const CANDIDATES = ['/brand/logo.svg', '/brand/logo.png', '/brand/logo.webp', '/brand/logo.jpg'];

interface BrandConfig { unitLines: string[] }
let configPromise: Promise<BrandConfig> | null = null;

function loadConfig(): Promise<BrandConfig> {
  configPromise ??= fetch('/brand/config.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : {}))
    .then((c: unknown) => {
      const lines = (c as { unitLines?: unknown })?.unitLines;
      return { unitLines: Array.isArray(lines) ? lines.filter((l): l is string => typeof l === 'string' && l.trim() !== '').slice(0, 3) : [] };
    })
    .catch(() => ({ unitLines: [] }));
  return configPromise;
}

export function useBrandConfig(): BrandConfig {
  const [cfg, setCfg] = useState<BrandConfig>({ unitLines: [] });
  useEffect(() => { let alive = true; void loadConfig().then(c => { if (alive) setCfg(c); }); return () => { alive = false; }; }, []);
  return cfg;
}

export default function BrandLogo() {
  const [idx, setIdx] = useState(0);
  if (idx >= CANDIDATES.length) {
    return <span className="brand-placeholder" aria-label="Vị trí logo chính thức">LOGO</span>;
  }
  return <img className="brand-logo" src={CANDIDATES[idx]} alt="Logo" onError={() => setIdx(i => i + 1)} />;
}

/** Logo + các dòng tên đơn vị. fallback: dòng hiển thị khi chưa cấu hình tên đơn vị. */
export function BrandBlock({ fallback }: { fallback?: string }) {
  const { unitLines } = useBrandConfig();
  const lines = unitLines.length > 0 ? unitLines : fallback ? [fallback] : [];
  return (
    <div className="brand-block">
      <BrandLogo />
      {lines.length > 0 && <div className="brand-unit">{lines.map((l, i) => <span key={i}>{l}</span>)}</div>}
    </div>
  );
}
