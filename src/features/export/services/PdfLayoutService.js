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
 *   Naively slicing the canvas at fixed A4 intervals cuts headings, code blocks,
 *   and diagrams in half between pages.
 *
 *   Fix: two-pass greedy algorithm.
 *   Pass 1 — "break AFTER a complete element":
 *     Find the LAST element whose BOTTOM edge falls entirely within the page.
 *     Guarantees that element is fully visible on the current page. Ideal.
 *   Pass 2 — "break BEFORE a crossing element":
 *     Find the FIRST element that STARTS within the page but ENDS beyond it.
 *     Push the break to just before that element starts, sending it to the next page.
 *     Used when no element fits completely within the remaining page space.
 *   Fallback — hard cut at pageEnd:
 *     Only fires when a single element (e.g. a very long code block) is taller
 *     than one full A4 page. The slice goes through the element — unavoidable.
 */
export class PdfLayoutService {
  /**
   * Computes the pixel-per-mm conversion factor for the current clone.
   *
   * The clone's CSS width MUST equal `printW` mm (162 mm by default).
   * `offsetWidth` gives us the equivalent in device pixels.
   * Dividing gives the scaling factor used to convert all mm measurements
   * (page height, margins, etc.) into pixel coordinates.
   *
   * IMPORTANT: If the clone width != printW mm, this ratio is wrong and every
   * page will capture the wrong amount of content, overflowing the PDF boundary.
   *
   * @param {HTMLElement} clone   - The mounted DOM clone.
   * @param {number}      printW  - Printable width in mm (A4 width minus both margins).
   * @returns {number} Pixels per millimetre.
   */
  static computePxPerMm(clone, printW) {
    return clone.offsetWidth / printW;
  }

  /**
   * Enforces strict pixel dimensions on every SVG and image in the clone.
   *
   * html2canvas KNOWN BUG: It ignores CSS `max-width`/`max-height` on SVG elements,
   * rendering them at their raw viewBox size. This breaks boundary math because we
   * measured smaller DOM rects but the canvas contains a taller image.
   *
   * Strategy:
   *  1. Read each element's rendered rect via `getBoundingClientRect`.
   *  2. If taller than 85% of a page, scale down proportionally (aspect ratio preserved).
   *  3. Hard-write dimensions into both HTML attributes (for SVGs, which html2canvas
   *     reads directly) and inline styles (belt-and-suspenders for images).
   *
   * @param {HTMLElement} clone    - The mounted DOM clone to mutate.
   * @param {number}      pxPerMm  - Pixels per millimetre (from `computePxPerMm`).
   * @param {number}      printH   - Printable page height in mm.
   */
  static lockElementDimensions(clone, pxPerMm, printH) {
    const maxSlicePxH = printH * pxPerMm;
    const safeMaxHeight = maxSlicePxH * 0.9;

    clone.querySelectorAll(".mermaid-diagram svg, .prose img").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.height > safeMaxHeight) {
        const ratio = safeMaxHeight / rect.height;
        const newW = rect.width * ratio;

        if (el.tagName.toLowerCase() === "svg") {
          el.setAttribute("height", safeMaxHeight);
          el.setAttribute("width", newW);
        }
        el.style.height = safeMaxHeight + "px";
        el.style.width = newW + "px";
        el.style.maxHeight = safeMaxHeight + "px";
        el.style.objectFit = "contain";
      }
    });
  }

  /**
   * Calculates an ordered list of "safe page-break positions" in pixel space.
   *
   * @param {HTMLElement} clone    - The mounted DOM clone (post-dimension-lock).
   * @param {number}      elH      - Total scrollHeight of the clone in pixels.
   * @param {number}      pxPerMm  - Pixels per millimetre.
   * @param {number}      printH   - Printable page height in mm.
   * @returns {number[]} Ascending list of y-pixel offsets; length = number of pages + 1.
   */
  static computePageBreaks(clone, elH, pxPerMm, printH) {
    const maxSlicePxH = printH * pxPerMm;
    const minFill = maxSlicePxH * 0.55;

    const bounds = [];
    const cloneRect = clone.getBoundingClientRect();
    clone
      .querySelectorAll(
        "p, h1, h2, h3, h4, h5, h6, pre, blockquote, ul, ol, table, tr, li, dl, dd, dt, section, figure, hr, .mermaid-diagram",
      )
      .forEach((el) => {
        // CRITICAL: Mermaid generates HTML elements (like <p>, <span>) inside SVG
        // foreignObjects. If we include these internal elements in our bounds array,
        // the algorithm will think it's safe to slice the page right through the
        // middle of the diagram! We MUST exclude children of .mermaid-diagram.
        if (
          el !== el.closest(".mermaid-diagram") &&
          el.closest(".mermaid-diagram")
        ) {
          return;
        }

        const rect = el.getBoundingClientRect();
        bounds.push(rect.top - cloneRect.top - 2);
        bounds.push(rect.bottom - cloneRect.top + 2);
      });
    bounds.push(0, elH);
    bounds.sort((a, b) => a - b);

    const starts = [0];
    let current = 0;
    while (current < elH - 1) {
      const pageEnd = Math.min(current + maxSlicePxH, elH);
      let next = pageEnd;
      // Preferred: find a boundary that satisfies minFill
      for (const b of bounds) {
        if (b >= current + minFill && b <= pageEnd) next = b;
      }

      // Fallback: if no boundary satisfies minFill (meaning we'd have to hard-cut
      // through the middle of an element), find ANY valid boundary on the page to
      // safely push the crossing element to the next page.
      if (next === pageEnd) {
        for (const b of bounds) {
          if (b > current && b <= pageEnd) next = b;
        }
      }

      if (next <= current) next = pageEnd;
      starts.push(next);
      current = next;
    }

    return starts;
  }
}
