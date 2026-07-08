"use client";

import { useEffect } from "react";

/**
 * Blocks the right-click context menu and drag-to-save on <img> elements
 * within the page this is mounted on (event delegation via the document,
 * scoped to IMG targets only — doesn't affect right-click elsewhere on
 * the page). Deters casual copying of marketing screenshots; like any
 * client-side measure it isn't a real access control (view-source, dev
 * tools and screenshots still work), so don't rely on it for anything
 * that actually needs to stay private.
 */
export function ImageProtection() {
  useEffect(() => {
    function blockImageContextMenu(e: MouseEvent) {
      if ((e.target as HTMLElement)?.tagName === "IMG") e.preventDefault();
    }
    function blockImageDrag(e: DragEvent) {
      if ((e.target as HTMLElement)?.tagName === "IMG") e.preventDefault();
    }

    document.addEventListener("contextmenu", blockImageContextMenu);
    document.addEventListener("dragstart", blockImageDrag);
    return () => {
      document.removeEventListener("contextmenu", blockImageContextMenu);
      document.removeEventListener("dragstart", blockImageDrag);
    };
  }, []);

  return null;
}
