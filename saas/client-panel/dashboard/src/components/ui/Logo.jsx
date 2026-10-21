// Marca "N" estilizada — mesma geometria usada no favicon (public/favicon.svg).
export function LogoMark({ className = 'h-10 w-10' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="namy-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#namy-g)" />
      <path
        d="M19 46V18h5.5l15.5 19.5V18H45v28h-5.5L24 26.5V46z"
        fill="#fff"
      />
      <circle cx="47.5" cy="16.5" r="4" fill="#22c55e" stroke="#4f46e5" strokeWidth="2" />
    </svg>
  );
}

export default function Logo() {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      <div className="leading-none">
        <p className="text-[22px] font-extrabold tracking-tight text-cream">NAMY</p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.42em] text-muted">Control</p>
      </div>
    </div>
  );
}
