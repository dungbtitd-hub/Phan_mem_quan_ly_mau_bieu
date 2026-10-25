import { useState } from 'react';

// Logo do đơn vị đặt trên máy chủ (thư mục branding/ cạnh docker-compose.yml), không đóng gói vào bản build.
// Thử lần lượt các tệp dưới đây; không có tệp nào thì hiển thị ô giữ chỗ "LOGO".
const CANDIDATES = ['/brand/logo.svg', '/brand/logo.png', '/brand/logo.webp', '/brand/logo.jpg'];

export default function BrandLogo() {
  const [idx, setIdx] = useState(0);
  if (idx >= CANDIDATES.length) {
    return <span className="brand-placeholder" aria-label="Vị trí logo chính thức">LOGO</span>;
  }
  return <img className="brand-logo" src={CANDIDATES[idx]} alt="Logo" onError={() => setIdx(i => i + 1)} />;
}
