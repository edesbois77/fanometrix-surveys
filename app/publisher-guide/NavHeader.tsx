"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const N = "#0B1929";
const G = "#D7B87A";

export function NavHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 60);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      style={{
        background: scrolled ? "rgba(11,25,41,0.80)" : N,
        backdropFilter: scrolled ? "blur(14px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(14px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.07)" : "1px solid transparent",
        position: "sticky",
        top: 0,
        zIndex: 40,
        transition: "background 0.3s ease, backdrop-filter 0.3s ease, border-color 0.3s ease",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Link href="/"><img src="/Fanometrix_Logo.png" alt="Fanometrix" style={{ height: 18, objectFit: "contain", display: "block" }} /></Link>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <a href="#how-it-works" style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, textDecoration: "none" }}>How it works</a>
          <a href="#privacy"      style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, textDecoration: "none" }}>Privacy</a>
          <a href="#technical"    style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, textDecoration: "none" }}>Technical</a>
          <a href="#contact"
            style={{ background: G, color: N, fontSize: 12, fontWeight: 700, padding: "7px 16px", borderRadius: 20, textDecoration: "none" }}>
            Get in touch
          </a>
        </nav>
      </div>
    </header>
  );
}
