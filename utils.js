const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'fbclid', 'gclid', '_ga', 'mc_cid', 'mc_eid', 'igshid',
  'msclkid', 'twclid', 'li_fat_id',
];

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    TRACKING_PARAMS.forEach(p => parsed.searchParams.delete(p));
    const path = parsed.pathname.replace(/\/$/, '') || '/';
    return (parsed.hostname + path + parsed.search).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

async function hashUrl(url) {
  const data = new TextEncoder().encode(normalizeUrl(url));
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 40);
}

function generateUserId() {
  return 'u_' + Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timeAgo(dateStr) {
  const s = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function hotScore(upvotes, downvotes, createdAt) {
  const score = upvotes - downvotes;
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
  return sign * order + (new Date(createdAt).getTime() / 1000 - new Date('2024-01-01').getTime() / 1000) / 45000;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}
