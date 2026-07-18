// Small inline brand marks for each conversation source, used on the Sources
// cards (create + edit). Inline SVG — no network requests, no external assets —
// so they render instantly and can't fail to load. These are simple,
// recognisable representative marks in each brand's colour, used purely to
// identify the source being selected.
import type { CSSProperties } from "react";

export function SourceLogo({ id, size = 18 }: { id: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  const wrap: CSSProperties = { flexShrink: 0 };

  switch (id) {
    case "YouTube":
      return (
        <svg {...common} style={wrap}>
          <rect x="1" y="5" width="22" height="14" rx="4" fill="#FF0000" />
          <path d="M10 8.5l6 3.5-6 3.5z" fill="#fff" />
        </svg>
      );
    case "Reddit":
      return (
        <svg {...common} style={wrap}>
          <circle cx="12" cy="13" r="9" fill="#FF4500" />
          <circle cx="8.7" cy="12.8" r="1.25" fill="#fff" />
          <circle cx="15.3" cy="12.8" r="1.25" fill="#fff" />
          <path d="M8.8 16c1.4 1.1 5 1.1 6.4 0" stroke="#fff" strokeWidth="1.1" fill="none" strokeLinecap="round" />
          <circle cx="17" cy="6.6" r="1.5" fill="#fff" />
          <path d="M12.4 9.2l3.5-2.4" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
        </svg>
      );
    case "News":
      return (
        <svg {...common} style={wrap}>
          <rect x="3" y="4.5" width="18" height="15" rx="2" fill="none" stroke="#565E6B" strokeWidth="1.6" />
          <line x1="6" y1="8" x2="18" y2="8" stroke="#565E6B" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="6" y1="11.5" x2="12.5" y2="11.5" stroke="#565E6B" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="6" y1="14.5" x2="12.5" y2="14.5" stroke="#565E6B" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="14" y="11" width="4" height="4" rx="0.5" fill="#565E6B" />
        </svg>
      );
    case "Google Trends":
      return (
        <svg {...common} style={wrap}>
          <polyline points="3.5,16.5 9,11 13,14.5 20.5,6" fill="none" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="20.5" cy="6" r="2.1" fill="#EA4335" />
        </svg>
      );
    case "X":
      return (
        <svg {...common} style={wrap}>
          <path d="M4.5 4.5l15 15M19.5 4.5l-15 15" stroke="#000" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case "Instagram":
      return (
        <svg {...common} style={wrap}>
          <rect x="3" y="3" width="18" height="18" rx="5.2" fill="none" stroke="#C13584" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="4" fill="none" stroke="#C13584" strokeWidth="1.8" />
          <circle cx="16.8" cy="7.2" r="1.2" fill="#C13584" />
        </svg>
      );
    case "TikTok":
      return (
        <svg {...common} style={wrap}>
          <path d="M13.5 4v9.7a3.3 3.3 0 1 1-2.6-3.23" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.5 4.2c.3 2.3 2 4 4.3 4.2" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}
