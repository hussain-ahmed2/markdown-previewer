import { els } from '../../../utils/dom.js';

/**
 * @module PdfCloneService
 *
 * Responsible exclusively for DOM cloning and print CSS injection.
 * Separating this concern means the rest of the PDF pipeline works on a
 * "clean room" snapshot that is always in light-mode and never affects the
 * live preview pane.
 *
 * Why a clone?
 *  - We must apply light-mode styles that would visually break the live preview.
 *  - html2canvas captures what is *visible in the DOM*, so we must control the
 *    element's style context absolutely.
 *  - Appending off-screen (left: -9999px) prevents any layout reflow impact.
 */
export class PdfCloneService {
  /**
   * Builds and appends an off-screen DOM clone of the markdown preview.
   *
   * The clone:
   *  1. Strips the `id` attribute to avoid duplicate-ID conflicts.
   *  2. Forces an exact `170mm` width (matching printW = 210mm - 2×20mm margins)
   *     so the pixel-to-mm ratio we compute later is precise.
   *  3. Injects a `<style>` tag with explicit light-mode overrides for every element
   *     that html2canvas renders (code blocks, tables, blockquotes, etc.), since
   *     html2canvas cannot honour CSS variables or Tailwind's `dark:` prefix.
   *  4. Positions itself at `left: -9999px` so the browser lays it out normally
   *     (giving us accurate `scrollHeight` / `getBoundingClientRect` values) without
   *     being visible to the user.
   *
   * @returns {HTMLElement} The mounted clone, ready for measurement and rendering.
   */
  static build() {
    const clone = els.preview.cloneNode(true);

    // Remove id to avoid duplicate id conflicts in the document
    clone.removeAttribute('id');

    // Matching Tailwind's prose utilities but in a self-contained clone
    clone.className = 'prose prose-gray max-w-none bg-white';

    // Hard-code the font stack so html2canvas picks it up without needing
    // CSS variables that it cannot resolve
    clone.style.fontFamily = "'Inter', sans-serif";
    clone.style.fontSize = '12pt';

    // Exactly 170mm = A4 (210mm) - left margin (24mm) - right margin (24mm) - a couple mm visual gutter
    // This number is critical: it is the reference width for computing pxPerMm later
    clone.style.width = '170mm';

    // No padding/margin – the PDF generator itself owns the margin via jsPDF.addImage offsets
    clone.style.padding = '0';
    clone.style.margin = '0';
    clone.style.boxSizing = 'border-box';
    clone.style.lineHeight = '1.6';

    // Force light-mode text colour regardless of the OS/browser preference
    clone.style.color = '#1f2937';

    // Inject explicit, light-mode-only styles. html2canvas cannot evaluate
    // media queries or Tailwind class conditions so every rule must be explicit.
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
        page-break-inside: avoid;
      }
      .prose code {
        background: #f1f1f1;
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.875em;
        font-family: 'JetBrains Mono', monospace;
        word-break: break-word;
      }
      /* Inline code inside a fenced block must not inherit the block's background */
      .prose pre code { background: transparent; padding: 0; font-size: inherit; white-space: pre-wrap; word-break: break-word; }

      /* ── Tables ── */
      .prose table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
      .prose th, .prose td { border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; text-align: left; }
      .prose th { background: #f3f4f6; font-weight: 600; }
      .prose tr:nth-child(even) td { background: #f9fafb; }

      /* ── Blockquotes ── */
      .prose blockquote { border-left: 4px solid #3b82f6; padding-left: 1rem; margin: 1rem 0; color: #6b7280; font-style: italic; }

      /* ── Headings ── */
      .prose h1 { font-size: 2rem; font-weight: 700; margin: 2rem 0 1rem; color: #111827; page-break-after: avoid; }
      .prose h2 { font-size: 1.5rem; font-weight: 600; margin: 1.75rem 0 0.75rem; color: #1f2937; page-break-after: avoid; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
      .prose h3 { font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.5rem; color: #374151; page-break-after: avoid; }
      .prose h4 { font-size: 1.125rem; font-weight: 600; margin: 1.25rem 0 0.5rem; color: #374151; page-break-after: avoid; }

      /* ── Body copy ── */
      .prose p { margin: 0.75rem 0; }
      .prose ul, .prose ol { margin: 0.75rem 0; padding-left: 1.5rem; }
      .prose li { margin: 0.25rem 0; }
      .prose img { max-width: 100%; height: auto; border-radius: 0.5rem; }
      .prose hr { border: none; border-top: 2px solid #e5e7eb; margin: 2rem 0; }
      .prose a { color: #2563eb; text-decoration: underline; }
      .prose strong { font-weight: 600; }
      .prose em { font-style: italic; }
      .prose del { text-decoration: line-through; }

      /* Force colour preservation in the canvas snapshot */
      @media print {
        .prose pre { background: #f6f8fa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .prose code { background: #f1f1f1 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .prose th { background: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .prose tr:nth-child(even) td { background: #f9fafb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `;
    clone.prepend(style);

    // Append off-screen so the browser computes real layout dimensions
    document.body.appendChild(clone);
    return clone;
  }

  /**
   * Safely removes the clone from the DOM.
   * Always call this in a `finally` block so memory is freed even on errors.
   *
   * @param {HTMLElement} clone - The clone returned by `build()`.
   */
  static destroy(clone) {
    if (clone && clone.parentNode) {
      clone.parentNode.removeChild(clone);
    }
  }
}
