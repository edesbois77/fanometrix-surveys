"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/app/components/SessionProvider";

const N = "#0B1929";
const G = "#D7B87A";

export function NavHeader() {
  const [scrolled, setScrolled] = useState(false);
  const { user } = useSession();
  // Logged-in users go to their role-aware home; visitors stay on the marketing site
  const logoHref = user ? "/home" : "/";

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 60); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-40 transition-all duration-300"
      style={{
        background:          scrolled ? "rgba(11,25,41,0.85)" : N,
        backdropFilter:      scrolled ? "blur(14px)" : "none",
        WebkitBackdropFilter:scrolled ? "blur(14px)" : "none",
        borderBottom:        scrolled ? "1px solid rgba(255,255,255,0.07)" : "1px solid transparent",
      }}
    >
      <div className="max-w-[1100px] mx-auto px-5 flex items-center justify-between gap-4" style={{ height: 56 }}>

        {/* Logo — goes to /home for logged-in users, / for public visitors */}
        <Link href={logoHref} className="flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Fanometrix_Logo.png" alt="Fanometrix" style={{ height: 18, objectFit: "contain", display: "block" }} />
        </Link>

        {/* Desktop nav links — hidden on mobile */}
        <nav className="hidden sm:flex items-center gap-6">
          <a href="#how-it-works" style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, textDecoration: "none" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
          >How it works</a>
          <a href="#privacy" style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, textDecoration: "none" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
          >Privacy</a>
          <a href="#technical" style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, textDecoration: "none" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
          >Technical</a>
          <a href="#contact"
            className="flex-shrink-0"
            style={{ background: G, color: N, fontSize: 12, fontWeight: 700, padding: "7px 18px", borderRadius: 20, textDecoration: "none" }}
          >Get in touch</a>
        </nav>

        {/* Mobile: CTA only — no space for text links */}
        <a href="#contact"
          className="sm:hidden flex-shrink-0"
          style={{ background: G, color: N, fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 20, textDecoration: "none", whiteSpace: "nowrap" }}
        >Get in touch</a>

      </div>
    </header>
  );
}
