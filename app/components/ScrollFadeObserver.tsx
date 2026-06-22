"use client";

import { useEffect } from "react";

/**
 * Activates .scroll-fade-up elements via IntersectionObserver.
 * Replaces the inline <script> approach so it works correctly on
 * client-side navigation (back button, Link clicks) as well as full page loads.
 */
export function ScrollFadeObserver() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".scroll-fade-up");
    if (!els.length) return;

    // Reset visibility so re-navigation replays the fade
    els.forEach(el => el.classList.remove("visible"));

    if (!("IntersectionObserver" in window)) {
      els.forEach(el => el.classList.add("visible"));
      return;
    }

    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0, rootMargin: "0px" }
    );

    els.forEach(el => obs.observe(el));

    // Safety fallback — reveal everything after 4s if observer never fires
    const timer = setTimeout(() => {
      els.forEach(el => el.classList.add("visible"));
    }, 4000);

    return () => {
      obs.disconnect();
      clearTimeout(timer);
    };
  }, []);

  return null;
}
