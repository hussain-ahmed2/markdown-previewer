/**
 * @module PdfLayoutService
 *
 * Owns all mathematical layout calculations for the PDF pipeline.
 * This service has zero dependencies on jsPDF or html2canvas — it works
 * exclusively with the live DOM clone, making it easy to unit-test in isolation.
 *
 * Two core problems this service solves:
 *
 * Problem 1 — SVG / Image bounding-box mismatch:
 *   html2canvas renders SVGs at their *intrinsic* pixel size, completely ignoring
 *   any CSS `max-width` or `max-height` rules. This means our boundary calculations
 *   (which come from `getBoundingClientRect`) and the actual canvas pixels are
 *   misaligned. Fix: we hard-wire width/height *attributes* on every SVG so
 *   html2canvas has no choice but to honour them.
 *
 * Problem 2 — Content slice-through:
 *   Naively slicing the canvas at fixed A4 intervals causes headings, code blocks,
 *   and diagrams to be cut in half between pages. Fix: we scan every block-level
 *   element and collect their top/bottom pixel offsets as "safe break boundaries",
 *   then select the last boundary that still keeps the page at least half-full.
 */
export class PdfLayoutService {
  /**
   * Computes the pixel-per-mm conversion factor for the current clone.
   *
   * The clone's CSS width is set to exactly `printW` mm (170 mm).
   * `offsetWidth` gives us the equivalent in device pixels.
   * Dividing gives us the scaling factor we use to convert all subsequent
   * mm measurements (margins, page height, etc.) into pixel coordinates.
   *
   * @param {HTMLElement} clone   - The mounted DOM clone.
   * @param {number}      printW  - Printable width in mm (A4 width minus both margins).
   * @returns {number} Pixels per millimetre.
   */
  static computePxPerMm(clone, printW) {
    // clone.offsetWidth is in CSS pixels; printW is the reference mm value baked into clone's CSS width
    return clone.offsetWidth / printW;
  }

  /**
   * Enforces strict pixel dimensions on every SVG and image in the clone.
   *
   * html2canvas KNOWN BUG: It ignores CSS `max-width`/`max-height` on SVG elements,
   * rendering them at their raw viewBox size instead. This blows up our boundary
   * math because we measured smaller DOM rects but the canvas contains a taller image.
   *
   * Fix strategy:
   *  1. Read the current rendered rect of each element via `getBoundingClientRect`.
   *  2. If the element's height would overflow a single page (> safeMaxH), scale it
   *     down proportionally while preserving the aspect ratio.
   *  3. Hard-write computed dimensions into both the `width`/`height` HTML *attributes*
   *     (for SVGs) and inline `style` properties (for all elements).
   *     Attributes take precedence over stylesheets in html2canvas's rendering path.
   *
   * @param {HTMLElement} clone       - The mounted DOM clone to mutate.
   * @param {number}      pxPerMm    - Pixels per millimetre (from `computePxPerMm`).
   * @param {number}      printH     - Printable page height in mm.
   */
  static lockElementDimensions(clone, pxPerMm, printH) {
    // A single page's usable height in pixels. We cap at 90% to guarantee a
    // small visual breathing room at the page boundary.
    const maxSlicePxH = printH * pxPerMm;
    const safeMaxH = maxSlicePxH * 0.9;

    clone.querySelectorAll('.mermaid-diagram svg, .prose img').forEach((el) => {
      const rect = el.getBoundingClientRect();

      let targetW = rect.width;
      let targetH = rect.height;

      // If the element is taller than a single page, scale it down proportionally.
      // We keep the aspect ratio so diagrams don't look squashed.
      if (targetH > safeMaxH) {
        const ratio = safeMaxH / targetH;
        targetH = safeMaxH;
        targetW = targetW * ratio;
      }

      // SVG-specific: set attributes so html2canvas sees the right dimensions
      // at render time, not just via CSS (which it ignores on SVGs)
      if (el.tagName.toLowerCase() === 'svg') {
        el.setAttribute('width', targetW);
        el.setAttribute('height', targetH);
      }

      // Also lock via inline styles as a belt-and-suspenders fallback for <img>
      el.style.width = targetW + 'px';
      el.style.height = targetH + 'px';
      el.style.maxWidth = targetW + 'px';
      el.style.maxHeight = targetH + 'px';
      el.style.objectFit = 'contain';
    });
  }

  /**
   * Calculates an ordered list of "safe page-break positions" in pixel space.
   *
   * Algorithm:
   *  1. Scan every block-level element in the clone and record both its `top` and
   *     `bottom` pixel offsets relative to the clone's own top edge. A ±2px tolerance
   *     is added so that adjacent elements with sub-pixel gaps don't cause missed breaks.
   *  2. Add sentinel values 0 (document start) and `elH` (document end) so every
   *     document maps to at least one page.
   *  3. Sort all boundary candidates ascending.
   *  4. Walk from `current = 0`, advancing by at most `maxSlicePxH` pixels per step.
   *     At each step, find the *last* boundary value that is:
   *       a. After `current + minFill` (page must be at least 55% full to prevent
   *          orphaned tiny content at the top of a page), and
   *       b. Before `current + maxSlicePxH` (must still fit on one page).
   *     If no such boundary exists (e.g., a single unbreakable element is taller than
   *     one full page), fall back to `pageEnd` and accept the hard cut.
   *  5. Return the array of pixel offsets that mark each page's starting y-coordinate.
   *
   * @param {HTMLElement} clone       - The mounted DOM clone (post-dimension-lock).
   * @param {number}      elH         - Total height of the clone in pixels.
   * @param {number}      pxPerMm    - Pixels per millimetre.
   * @param {number}      printH     - Printable page height in mm.
   * @returns {number[]} Ascending list of y-pixel offsets; length = number of pages + 1.
   */
  static computePageBreaks(clone, elH, pxPerMm, printH) {
    const maxSlicePxH = printH * pxPerMm;
    // Pages must be at least 55% full before we consider breaking.
    // This prevents a single heading or short paragraph from getting an entire page.
    const minFill = maxSlicePxH * 0.55;

    // ── Step 1: Collect boundary candidates ──────────────────────────────────
    const cloneRect = clone.getBoundingClientRect();
    const bounds = [];

    // We include all block-level and Mermaid elements. Inline elements (spans, em, etc.)
    // are deliberately excluded — we never want to break mid-sentence.
    clone.querySelectorAll(
      'p, h1, h2, h3, h4, h5, h6, pre, blockquote, ul, ol, table, tr, li, dl, dd, dt, section, figure, hr, .mermaid-diagram'
    ).forEach((el) => {
      const rect = el.getBoundingClientRect();
      // top of element – small tolerance so the element isn't clipped right at its pixel edge
      bounds.push(rect.top - cloneRect.top - 2);
      // bottom of element + tolerance
      bounds.push(rect.bottom - cloneRect.top + 2);
    });

    // Sentinels: always include document start and end
    bounds.push(0, elH);
    bounds.sort((a, b) => a - b);

    // ── Step 2: Greedy forward-walk to pick optimal breaks ───────────────────
    const pageStarts = [0]; // First page always starts at pixel 0
    let current = 0;

    while (current < elH - 1) {
      const pageEnd = Math.min(current + maxSlicePxH, elH);

      // Default: hard cut at pageEnd (only fallback if no safe boundary found)
      let next = pageEnd;

      // Find the last safe boundary within this page's range
      for (const b of bounds) {
        if (b >= current + minFill && b <= pageEnd) {
          // This boundary is valid — keep looking for a later one
          next = b;
        }
      }

      // Safety: if `next` didn't advance, force a hard cut to prevent infinite loop
      if (next <= current) next = pageEnd;

      pageStarts.push(next);
      current = next;
    }

    return pageStarts;
  }
}
