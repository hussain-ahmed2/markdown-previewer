import { UIManager } from '../../ui/UIManager.js';

/**
 * @module PdfRenderService
 *
 * The final stage of the PDF pipeline. Takes a prepared DOM clone and a list of
 * page-break boundaries and produces a fully paginated jsPDF document.
 *
 * Rendering strategy — "monolithic canvas + slice":
 *   We render the *entire* clone into one giant in-memory canvas in a single
 *   html2canvas call, then use a temporary 2D canvas to crop individual page-sized
 *   strips from it. This is significantly faster and more accurate than calling
 *   html2canvas multiple times (which would require re-measuring positions).
 *
 *   Page slicing is done with `ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)`.
 *   Each call reads a horizontal strip of the monolithic canvas and writes it to the
 *   full width of the temporary canvas. The temporary canvas is then encoded as a
 *   JPEG data URL and inserted into the jsPDF instance.
 */
export class PdfRenderService {
  /**
   * Renders the full clone onto a monolithic in-memory canvas.
   *
   * We use `html2canvas` with `scale: 2` to get 2× retina-quality output.
   * The `onclone` hook forcibly strips the `dark` class from the cloned document
   * so any residual Tailwind `dark:` utilities are neutralised.
   *
   * @param {HTMLElement} clone       - The prepared, dimension-locked DOM clone.
   * @param {number}      elW         - The clone's `offsetWidth` in CSS pixels.
   * @param {number}      elH         - The clone's `scrollHeight` in CSS pixels.
   * @returns {Promise<HTMLCanvasElement>} The full-document canvas at 2× resolution.
   */
  static async renderCanvas(clone, elW, elH) {
    return html2canvas(clone, {
      // 2× scale = double the pixel density → sharper text and lines in the PDF
      scale: 2,
      useCORS: true,         // allow cross-origin images (e.g. remote markdown images)
      logging: false,        // suppress html2canvas debug output
      width: elW,
      height: elH,
      // Match the window width so any responsive breakpoints in the clone resolve correctly
      windowWidth: document.documentElement.clientWidth,
      onclone: (doc) => {
        // html2canvas clones the document before rendering. Strip dark mode so
        // no `dark:` Tailwind utilities bleed into the PDF snapshot.
        doc.documentElement.classList.remove('dark');
      },
    });
  }

  /**
   * Slices the monolithic canvas into A4-sized strips and builds a jsPDF document.
   *
   * For each page:
   *  1. Resize the temporary canvas to match the exact pixel height of this slice.
   *  2. Fill with white (avoids transparent regions showing as black in some PDF viewers).
   *  3. Copy the relevant horizontal strip from the monolithic canvas using `drawImage`.
   *  4. Encode to JPEG at 98% quality — good balance of sharpness vs file size.
   *  5. Insert the image into the jsPDF page at (margin, margin), sized to fill the
   *     printable width and the mm-equivalent of the slice's pixel height.
   *  6. Optionally draw header/footer lines and text if the user enabled them.
   *
   * @param {HTMLCanvasElement} fullCanvas - The 2× monolithic canvas from `renderCanvas`.
   * @param {number[]}          pageStarts - Array of y-pixel offsets from `PdfLayoutService`.
   * @param {number}            pxPerMm    - Pixels per millimetre.
   * @param {Object}            config     - PDF layout and decoration options.
   * @param {number}            config.pageW        - A4 page width in mm (210).
   * @param {number}            config.pageH        - A4 page height in mm (297).
   * @param {number}            config.margin       - Page margin in mm (24 ≈ 1 inch).
   * @param {number}            config.printW       - Printable width in mm.
   * @param {boolean}           config.includeHeader - Show header line and title.
   * @param {string}            config.headerTitle  - Custom title text for the header.
   * @param {boolean}           config.includeFooter - Show footer line and page number.
   * @param {Function}          onProgress - Called with (fraction, label) after each page.
   * @returns {Promise<import('jspdf').jsPDF>} The fully populated jsPDF instance.
   */
  static async buildPdf(fullCanvas, pageStarts, pxPerMm, config, onProgress) {
    const { pageW, pageH, margin, printW, includeHeader, headerTitle, includeFooter } = config;
    const totalPages = pageStarts.length - 1;

    // A reusable off-screen canvas to crop each page slice into
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = fullCanvas.width; // same device-pixel width as the full canvas
    const ctx = tempCanvas.getContext('2d', { alpha: false }); // alpha: false → faster fillRect

    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const dateStr = new Date().toLocaleDateString();

    for (let i = 0; i < totalPages; i++) {
      // ── Compute slice coordinates ─────────────────────────────────────────
      const offsetPx = pageStarts[i];
      const slicePxH = pageStarts[i + 1] - offsetPx; // height of this page in CSS pixels

      // Yield to the browser event loop so the progress bar can repaint
      await new Promise((r) => setTimeout(r, 0));
      onProgress((i + 1) / totalPages, `${i + 1} / ${totalPages}`);

      // ── Crop this page strip from the monolithic canvas ───────────────────
      // tempCanvas height must match the slice (at 2× scale) so aspect ratio is preserved
      tempCanvas.height = slicePxH * 2; // ×2 because fullCanvas was rendered at scale: 2
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      // drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh):
      //   source = full 2× canvas
      //   sy     = offsetPx × 2  (source y in 2× pixel space)
      //   sh     = slicePxH × 2  (source height in 2× pixel space)
      //   Destination fills the full tempCanvas at 1:1
      ctx.drawImage(
        fullCanvas,
        0, offsetPx * 2, fullCanvas.width, slicePxH * 2,  // source rect
        0, 0, tempCanvas.width, tempCanvas.height          // dest rect
      );

      // ── Encode and insert into PDF ────────────────────────────────────────
      const imgData = tempCanvas.toDataURL('image/jpeg', 0.98);
      // Convert the slice height from CSS pixels → mm so jsPDF sizes it correctly
      const imgHeightMm = slicePxH / pxPerMm;

      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', margin, margin, printW, imgHeightMm);

      // ── Optional header ───────────────────────────────────────────────────
      if (includeHeader) {
        // Separator line drawn 4mm above the content top (margin)
        pdf.setDrawColor(229, 231, 235);
        pdf.line(margin, margin - 4, pageW - margin, margin - 4);

        // Date on the left, title on the right, both 8mm above the content top
        pdf.setFontSize(9);
        pdf.setTextColor(107, 114, 128); // Tailwind gray-500
        pdf.text(dateStr, margin, margin - 8);
        pdf.text(headerTitle, pageW - margin, margin - 8, { align: 'right' });
      }

      // ── Optional footer ───────────────────────────────────────────────────
      if (includeFooter) {
        // Separator line drawn 4mm below the content bottom
        pdf.setDrawColor(229, 231, 235);
        pdf.line(margin, pageH - margin + 4, pageW - margin, pageH - margin + 4);

        // Page number on the right, 9mm below the content bottom
        pdf.setFontSize(9);
        pdf.setTextColor(107, 114, 128);
        pdf.text(`Page ${i + 1} of ${totalPages}`, pageW - margin, pageH - margin + 9, { align: 'right' });
      }
    }

    return pdf;
  }
}
