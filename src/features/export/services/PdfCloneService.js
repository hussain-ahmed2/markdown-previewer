import { els } from '../../../utils/dom.js';

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
    const container = document.createElement('div');
    container.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: -99999px',
      'width: 162mm',   // must match clone width and printW
      'overflow: visible',
      'pointer-events: none',
      'z-index: -9999',
    ].join('; ');
    document.body.appendChild(container);

    // ── Clone the live preview ────────────────────────────────────────────────
    const clone = els.preview.cloneNode(true);
    clone.removeAttribute('id');
    clone.className = 'prose prose-gray max-w-none bg-white';

    // Hard-code font stack — html2canvas doesn't resolve CSS variables or @font-face
    // references the same way the browser does, so we make it explicit
    clone.style.fontFamily = "'Inter', sans-serif";
    clone.style.fontSize = '12pt';

    // CRITICAL: clone width must equal printW (162 mm) so that
    // pxPerMm = clone.offsetWidth / printW is the correct 1:1 ratio.
    clone.style.width = '162mm';
    clone.style.padding = '0';
    clone.style.margin = '0';
    clone.style.boxSizing = 'border-box';
    clone.style.lineHeight = '1.6';
    clone.style.color = '#1f2937'; // force light mode text

    // ── Inject print styles ───────────────────────────────────────────────────
    // html2canvas cannot evaluate media queries, CSS variables, or Tailwind's
    // dark: prefix. Every rule that matters for PDF rendering must be explicitly
    // flat and light-mode only.
    const style = document.createElement('style');
    style.textContent = `
      /* ── Code blocks ── */
      .prose pre {
        background: #f6f8fa;
        color: #24292e;
        padding: 1rem;
        border-radius: 0.5rem;
        overflow-x: visible;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .prose code {
        background: #f1f1f1;
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.875em;
        font-family: 'JetBrains Mono', monospace;
        word-break: break-word;
      }
      /* Reset inline code inside fenced block — it must not double-background */
      .prose pre code {
        background: transparent;
        padding: 0;
        font-size: inherit;
        white-space: pre-wrap;
        word-break: break-word;
      }

      /* ── Tables ── */
      .prose table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
      .prose th, .prose td { border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; text-align: left; }
      .prose th { background: #f3f4f6; font-weight: 600; }
      .prose tr:nth-child(even) td { background: #f9fafb; }

      /* ── Blockquotes ── */
      .prose blockquote {
        border-left: 4px solid #3b82f6;
        padding-left: 1rem;
        margin: 1rem 0;
        color: #6b7280;
        font-style: italic;
      }

      /* ── Headings ── */
      .prose h1 { font-size: 2rem;   font-weight: 700; margin: 2rem 0 1rem;    color: #111827; }
      .prose h2 { font-size: 1.5rem; font-weight: 600; margin: 1.75rem 0 0.75rem; color: #1f2937; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
      .prose h3 { font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.5rem; color: #374151; }
      .prose h4 { font-size: 1.125rem; font-weight: 600; margin: 1.25rem 0 0.5rem; color: #374151; }

      /* ── Body copy ── */
      .prose p  { margin: 0.75rem 0; }
      .prose ul, .prose ol { margin: 0.75rem 0; padding-left: 1.5rem; }
      .prose li { margin: 0.25rem 0; }
      .prose img { max-width: 100%; height: auto; border-radius: 0.5rem; }
      .prose hr  { border: none; border-top: 2px solid #e5e7eb; margin: 2rem 0; }
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
  static destroy(clone) {
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
