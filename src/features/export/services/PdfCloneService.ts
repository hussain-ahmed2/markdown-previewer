import { els } from "../../../utils/dom.js";

/**
 * @module PdfCloneService
 *
 * Responsible for DOM cloning, print CSS injection, and the isolated rendering
 * container that hosts the clone during PDF generation.
 *
 * THE MOST CRITICAL DETAIL — WHY WE USE A `position: fixed` CONTAINER:
 *
 * The live app uses a `height: 100vh; overflow: hidden` layout to create the
 * split-pane editor. When we naively `document.body.appendChild(clone)`, the
 * clone is inside a parent chain that has `overflow: hidden`. For elements in
 * the clone that are below the visible viewport, the browser clips them during
 * layout, and `getBoundingClientRect()` returns WRONG values (0-height rects or
 * positions relative to the clip boundary instead of the element's true position).
 *
 * This breaks the entire page-break calculation in PdfLayoutService, causing
 * the algorithm to "see" elements in the wrong places and slice right through them.
 *
 * FIX: We create a separate `div` with `position: fixed; overflow: visible` and
 * append the clone inside THAT container. Fixed-position elements are painted
 * relative to the viewport root, NOT affected by ancestor `overflow: hidden`
 * properties. `getBoundingClientRect()` then returns accurate, stable values
 * for ALL elements in the clone regardless of document scroll position.
 */
export class PdfCloneService {
  /**
   * Creates an isolated fixed-position rendering container, builds a light-mode
   * clone of the markdown preview inside it, and returns the clone.
   *
   * Key implementation details:
   *  1. The CONTAINER is `position: fixed; overflow: visible` to escape all
   *     ancestor `overflow: hidden` clipping constraints.
   *  2. The container is positioned at `left: -99999px` — completely off-screen
   *     but still fully laid out by the browser engine.
   *  3. The CLONE width is `162mm` (= printW), so that `pxPerMm = clone.offsetWidth / printW`
   *     is exactly 1:1. A mismatch here would corrupt the px→mm scaling factor.
   *  4. All light-mode colours are hardcoded in an injected `<style>` tag because
   *     html2canvas cannot evaluate CSS variables or Tailwind's `dark:` class modifiers.
   *  5. A reference to the outer container is stored on `clone._pdfContainer` so
   *     `destroy()` can remove the container (not just the clone) from the DOM.
   *
   * @returns {HTMLElement} The clone, ready for dimension locking and rendering.
   */
  static build() {
    // ── Create isolated rendering container ──────────────────────────────────
    // position: fixed → immune to overflow:hidden on body/main
    // overflow: visible → clone content can be taller than the viewport without
    //                     being clipped (getBoundingClientRect stays accurate)
    // pointer-events: none → click events pass through (just in case)
    // z-index: -9999 → below everything so user never sees a flash
    const container = document.createElement("div");
    container.style.cssText = [
      "position: fixed",
      "top: 0",
      "left: -99999px",
      "width: 162mm", // must match clone width and printW
      "overflow: visible",
      "pointer-events: none",
      "z-index: -9999",
    ].join("; ");
    document.body.appendChild(container);

    // ── Clone the live preview ────────────────────────────────────────────────
    const clone = els.preview.cloneNode(true) as HTMLElement & {
      _pdfContainer?: HTMLDivElement;
    };
    clone.removeAttribute("id");
    clone.className = "prose prose-gray max-w-none bg-white";

    // Hard-code font stack — html2canvas doesn't resolve CSS variables or @font-face
    // references the same way the browser does, so we make it explicit
    clone.style.fontFamily = "'Inter', sans-serif";
    clone.style.fontSize = "12pt";

    // CRITICAL: clone width must equal printW (162 mm) so that
    // pxPerMm = clone.offsetWidth / printW is the correct 1:1 ratio.
    clone.style.width = "162mm";
    clone.style.padding = "0";
    clone.style.margin = "0";
    clone.style.boxSizing = "border-box";
    clone.style.lineHeight = "1.6";
    clone.style.color = "#1f2937"; // force light mode text

    // ── Ultimate Fix for html2canvas List Marker Bug ─────────────────────────
    // html2canvas notoriously misaligns list markers (::marker, list-style).
    // The CSS fixes often fail depending on the browser version. The only 100%
    // reliable fix is to disable native markers and inject real DOM spans.
    const lists = clone.querySelectorAll("ul, ol");
    lists.forEach((el) => {
      const list = el as HTMLElement;
      list.style.setProperty("list-style-type", "none", "important");
      list.style.setProperty("padding-left", "1.625em", "important");
      const isOrdered = list.tagName.toLowerCase() === "ol";

      Array.from(list.children).forEach((el, index) => {
        const li = el as HTMLElement;
        if (li.tagName.toLowerCase() === "li") {
          li.style.setProperty("position", "relative", "important");
          li.style.setProperty("list-style-type", "none", "important");

          const markerSpan = document.createElement("span");
          markerSpan.style.cssText =
            "position: absolute; right: 100%; margin-right: 0.375em; top: 0;";

          if (isOrdered) {
            markerSpan.textContent = `${index + 1}.`;
            markerSpan.style.fontWeight = "400";
          } else {
            // Use bullet character •
            markerSpan.textContent = "•";
            // Align bullet slightly higher to match default ::marker aesthetics
            markerSpan.style.setProperty("top", "-0.1em", "important");
            markerSpan.style.setProperty("font-size", "1.2em", "important");
          }

          // A nested <p> tag is often generated by marked for list items containing
          // block elements. We must inject the span inside the first block-level child
          // or directly into the <li> if no block-level child exists.
          const target = (
            li.firstElementChild?.tagName === "P" ? li.firstElementChild : li
          ) as HTMLElement;
          target.style.setProperty("position", "relative", "important");
          // Remove default margin from the <p> so it aligns with the marker
          if (target !== li) {
            target.style.setProperty("margin-top", "0", "important");
          }

          target.insertBefore(markerSpan, target.firstChild);
        }
      });
    });

    // ── Inject print styles ───────────────────────────────────────────────────
    // html2canvas cannot evaluate media queries, CSS variables, or Tailwind's
    // dark: prefix. Every rule that matters for PDF rendering must be explicitly
    // flat and light-mode only.
    const style = document.createElement("style");
    style.textContent = `
      /* ── Synchronization Fix ── */
      /* html2canvas struggles with margin-collapse and Tailwind's :where() selectors. */
      /* We eliminate margin-bottom completely and enforce explicit margin-top gaps. */
      /* This mathematically guarantees DOM layouts perfectly match canvas rendering. */
      .prose * { margin-bottom: 0 !important; }
      .prose *:first-child { margin-top: 0 !important; }

      /* ── Code blocks ── */
      .prose pre {
        margin-top: 1.7em !important;
        background: #f6f8fa !important;
        color: #24292e !important;
        padding: 1rem !important;
        border-radius: 0.5rem !important;
        overflow-x: visible !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
      }
      .prose code {
        background: #f1f1f1 !important;
        padding: 0.125rem 0.375rem !important;
        border-radius: 0.25rem !important;
        font-size: 0.875em !important;
        font-family: 'JetBrains Mono', monospace !important;
        word-break: break-word !important;
        vertical-align: baseline !important;
      }
      .prose code::before, .prose code::after {
        display: none !important;
        content: "" !important;
      }
      .prose pre code {
        background: transparent !important;
        padding: 0 !important;
        font-size: inherit !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
      }

      /* ── Tables ── */
      .prose table { border-collapse: collapse !important; width: 100% !important; margin-top: 2em !important; }
      .prose th, .prose td { border: 1px solid #d1d5db !important; padding: 0.5rem 0.75rem !important; text-align: left !important; }
      .prose th { background: #f3f4f6 !important; font-weight: 600 !important; }
      .prose tr:nth-child(even) td { background: #f9fafb !important; }

      /* ── Blockquotes ── */
      .prose blockquote {
        border-left: 4px solid #3b82f6 !important;
        padding-left: 1rem !important;
        margin-top: 1.6em !important;
        color: #6b7280 !important;
        font-style: italic !important;
      }

      /* ── Headings ── */
      .prose h1 { font-size: 2.25em !important; font-weight: 800 !important; margin-top: 2em !important; color: #111827 !important; line-height: 1.1 !important; }
      .prose h2 { font-size: 1.5em !important; font-weight: 700 !important; margin-top: 2em !important; color: #1f2937 !important; line-height: 1.3 !important; }
      .prose h3 { font-size: 1.25em !important; font-weight: 600 !important; margin-top: 1.6em !important; color: #374151 !important; line-height: 1.6 !important; }
      .prose h4 { font-size: 1.125em !important; font-weight: 600 !important; margin-top: 1.5em !important; color: #374151 !important; line-height: 1.5 !important; }

      /* ── Body copy ── */
      .prose p  { margin-top: 1.25em !important; line-height: 1.75 !important; }
      .prose ul, .prose ol { margin-top: 1.25em !important; padding-left: 1.625em !important; }
      .prose li { margin-top: 0.5em !important; }
      .prose img { max-width: 100% !important; height: auto !important; border-radius: 0.5rem !important; margin-top: 2em !important; }
      .prose hr  { border: none !important; border-top: 2px solid #e5e7eb !important; margin-top: 3em !important; }
      .prose a   { color: #2563eb; text-decoration: underline; }
      .prose strong { font-weight: 600; }
      .prose em     { font-style: italic; }
      .prose del    { text-decoration: line-through; }

      /* Force colours during html2canvas snapshot (equivalent of print-color-adjust) */
      @media print {
        .prose pre  { background: #f6f8fa !important; -webkit-print-color-adjust: exact; }
        .prose code { background: #f1f1f1 !important; -webkit-print-color-adjust: exact; }
        .prose th   { background: #f3f4f6 !important; -webkit-print-color-adjust: exact; }
        .prose tr:nth-child(even) td { background: #f9fafb !important; -webkit-print-color-adjust: exact; }
      }
    `;
    clone.prepend(style);

    // ── Mount clone into isolated container ───────────────────────────────────
    container.appendChild(clone);

    // Store the container reference on the clone so destroy() can remove it cleanly
    clone._pdfContainer = container;

    return clone;
  }

  /**
   * Removes the isolated container (and its clone child) from the DOM.
   * Always call this inside a `finally` block to guarantee memory is freed,
   * even if the PDF generation throws an error.
   *
   * @param {HTMLElement} clone - The clone returned by `build()`.
   */
  static destroy(clone: HTMLElement & { _pdfContainer?: HTMLDivElement }) {
    // Remove the outer container, not just the clone inside it
    const container = clone && clone._pdfContainer;
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    } else if (clone && clone.parentNode) {
      // Fallback: if container ref is missing, remove clone directly
      clone.parentNode.removeChild(clone);
    }
  }
}
