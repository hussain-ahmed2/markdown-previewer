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
 *   (which come from getBoundingClientRect) and the actual canvas pixels are
 *   misaligned. Fix: we hard-wire width/height *attributes* on every SVG so
 *   html2canvas has no choice but to honour them.
 *
 * Problem 2 — Content slice-through:
 *   Naively slicing the canvas at fixed A4 intervals causes headings, code blocks,
 *   and diagrams to be cut in half between pages.
 *
 *   Fix: a two-priority boundary search that ALWAYS prefers breaking AFTER a complete
 *   element (safe), and only falls back to breaking BEFORE an element (also safe but
 *   risks a slightly underfull page) when no bottom-edge break is available.
 *   Top-edge breaks in the algorithm carry a generous 8px tolerance so sub-pixel
 *   rounding errors in getBoundingClientRect never land the break mid-glyph.
 */
export class PdfLayoutService {
  /**
   * Computes the pixel-per-mm conversion factor for the current clone.
   *
   * The clone's CSS width is set to exactly `printW` mm (162 mm).
   * `offsetWidth` gives us the equivalent in device pixels.
   * Dividing gives the scaling factor used to convert all subsequent mm measurements
   * (margins, page height, etc.) into pixel coordinates.
   *
   * IMPORTANT: The clone width MUST equal `printW` mm so that this ratio is exact.
   * A mismatch (e.g. clone = 170mm, printW = 162mm) causes every page to capture
   * 5% too much content, overflowing the bottom of each PDF page.
   *
   * @param {HTMLElement} clone   - The mounted DOM clone.
   * @param {number}      printW  - Printable width in mm (A4 width minus both margins).
   * @returns {number} Pixels per millimetre.
   */
  static computePxPerMm(clone, printW) {
    // clone.offsetWidth is in CSS pixels; printW is the reference mm value baked
    // into clone's CSS width property in PdfCloneService
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
   * @param {HTMLElement} clone    - The mounted DOM clone to mutate.
   * @param {number}      pxPerMm  - Pixels per millimetre (from `computePxPerMm`).
   * @param {number}      printH   - Printable page height in mm.
   */
  static lockElementDimensions(clone, pxPerMm, printH) {
    // Cap at 85% of page height (not 90%) so the element has visible margin before
    // and after it on the page — a diagram touching the header/footer line looks bad
    const maxSlicePxH = printH * pxPerMm;
    const safeMaxH = maxSlicePxH * 0.85;

    clone.querySelectorAll('.mermaid-diagram svg, .prose img').forEach((el) => {
      const rect = el.getBoundingClientRect();

      let targetW = rect.width;
      let targetH = rect.height;

      // Scale down to safeMaxH while preserving aspect ratio
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
   * Algorithm — two-priority boundary search:
   *
   *  PRIORITY 1 — Break AFTER a complete element (bottom edge):
   *    Guarantees the element is entirely on the current page. This is the ideal
   *    break point. We take the LAST bottom edge in [minFill, pageEnd].
   *
   *  PRIORITY 2 — Break BEFORE an element starts (top edge − tolerance):
   *    Pushes the element entirely to the next page. Used when no bottom-edge break
   *    is available (e.g. the only element that fits is one whose bottom overruns
   *    the page). Tolerance is 8px (not 2px) to guard against sub-pixel rounding.
   *
   *  FALLBACK — Hard cut at `pageEnd`:
   *    Only triggered when a single element spans more than one full page (e.g. a
   *    very long code block). The slice goes through the element — unavoidable.
   *
   *  minFill is set to 30% (not 55%) so the algorithm has maximum flexibility to
   *  find a clean boundary. A 30%-full page is far better than a sliced heading.
   *
   * @param {HTMLElement} clone    - The mounted DOM clone (post-dimension-lock).
   * @param {number}      elH      - Total scrollHeight of the clone in pixels.
   * @param {number}      pxPerMm  - Pixels per millimetre.
   * @param {number}      printH   - Printable page height in mm.
   * @returns {number[]} Ascending list of y-pixel offsets; length = number of pages + 1.
   */
  static computePageBreaks(clone, elH, pxPerMm, printH) {
    const maxSlicePxH = printH * pxPerMm;
    // 30% minimum fill — much more generous than 55%, maximising the chance of finding
    // a clean boundary rather than falling back to a hard cut through content
    const minFill = maxSlicePxH * 0.30;

    // Tolerance added to top edges: 8px prevents sub-pixel rounding from landing
    // the break inside the very first pixel of the next element
    const TOP_TOLERANCE = 8;
    const BOTTOM_TOLERANCE = 2;

    // ── Collect boundary candidates ────────────────────────────────────────────
    const cloneRect = clone.getBoundingClientRect();

    // Two separate lists so we can prefer bottom-edge breaks (Priority 1) over
    // top-edge breaks (Priority 2) within the same page range
    const bottomEdges = []; // break AFTER element — element is fully on current page
    const topEdges = [];    // break BEFORE element — element moves to next page

    // Only block-level elements are included. Inline elements (span, a, em, strong)
    // are intentionally excluded — we never want to break mid-sentence or mid-word.
    clone.querySelectorAll(
      'p, h1, h2, h3, h4, h5, h6, pre, blockquote, ul, ol, table, figure, hr, .mermaid-diagram'
    ).forEach((el) => {
      const rect = el.getBoundingClientRect();
      // Position relative to the clone's own top edge (not the viewport)
      const relTop    = rect.top    - cloneRect.top;
      const relBottom = rect.bottom - cloneRect.top;

      // Bottom edge + small tolerance: ensures the element's last pixel is included
      bottomEdges.push(relBottom + BOTTOM_TOLERANCE);

      // Top edge − generous tolerance: prevents the break from landing on the
      // element's first rendered pixels due to sub-pixel rounding
      topEdges.push(relTop - TOP_TOLERANCE);
    });

    // Sentinels: always start at 0 and always end at the document bottom
    bottomEdges.push(0, elH);
    topEdges.push(0, elH);

    bottomEdges.sort((a, b) => a - b);
    topEdges.sort((a, b) => a - b);

    // ── Greedy forward-walk ────────────────────────────────────────────────────
    const pageStarts = [0]; // First page always starts at the top of the document
    let current = 0;

    while (current < elH - 1) {
      const pageEnd = Math.min(current + maxSlicePxH, elH);

      // PRIORITY 1: find last bottom-edge in [current + minFill, pageEnd]
      let bestBottom = -1;
      for (const b of bottomEdges) {
        if (b >= current + minFill && b <= pageEnd) bestBottom = b;
      }

      // PRIORITY 2: only needed if no bottom-edge break was found
      let bestTop = -1;
      if (bestBottom === -1) {
        for (const t of topEdges) {
          if (t >= current + minFill && t <= pageEnd) bestTop = t;
        }
      }

      let next;
      if (bestBottom !== -1) {
        // Ideal: break after a complete element
        next = bestBottom;
      } else if (bestTop !== -1) {
        // Good: break before the next element starts
        next = bestTop;
      } else {
        // Last resort: hard cut (element is taller than a full page)
        next = pageEnd;
      }

      // Safety guard: prevent infinite loop if nothing advanced
      if (next <= current) next = pageEnd;

      pageStarts.push(next);
      current = next;
    }

    return pageStarts;
  }
}
