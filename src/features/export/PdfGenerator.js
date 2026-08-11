import { els } from '../../utils/dom.js';
import { UIManager } from '../ui/UIManager.js';
import { PdfCloneService } from './services/PdfCloneService.js';
import { PdfLayoutService } from './services/PdfLayoutService.js';
import { PdfRenderService } from './services/PdfRenderService.js';

/**
 * @module PdfGenerator
 *
 * Top-level orchestrator for the PDF export feature.
 *
 * This class is intentionally thin — it owns only two responsibilities:
 *  1. Registering the user-facing button event listeners.
 *  2. Sequencing the three lower-level services in the correct order.
 *
 * The heavy lifting is delegated to:
 *  - {@link PdfCloneService}  — DOM cloning and print CSS injection
 *  - {@link PdfLayoutService} — SVG scaling and page-break boundary detection
 *  - {@link PdfRenderService} — html2canvas rendering and jsPDF assembly
 *
 * PDF pipeline (high level):
 *
 *  ┌─────────────────────┐
 *  │  1. Clone the DOM   │  PdfCloneService.build()
 *  └────────┬────────────┘
 *           │
 *  ┌────────▼────────────┐
 *  │  2. Fix SVG sizes   │  PdfLayoutService.lockElementDimensions()
 *  │  3. Find breaks     │  PdfLayoutService.computePageBreaks()
 *  └────────┬────────────┘
 *           │
 *  ┌────────▼────────────┐
 *  │  4. Render canvas   │  PdfRenderService.renderCanvas()
 *  │  5. Slice + export  │  PdfRenderService.buildPdf()
 *  └─────────────────────┘
 */
export class PdfGenerator {
  /**
   * Attaches click handlers to the "Direct Download" and "Send to Printer" buttons.
   * Called once during application initialisation.
   */
  static init() {
    els.pdfDirectBtn.addEventListener('click', () => this.exportDocument('download'));
    els.pdfPrintBtn.addEventListener('click', () => this.exportDocument('print'));
  }

  /**
   * Runs the full PDF export pipeline.
   *
   * Flow:
   *  1. Show the progress bar and disable UI buttons while work is in progress.
   *  2. Clone the preview, fix SVG dimensions, and compute page breaks.
   *  3. Render the clone onto a monolithic 2× canvas.
   *  4. Slice the canvas into per-page images and assemble a jsPDF document.
   *  5. Either trigger a file download or open the system print dialog.
   *  6. Clean up the DOM clone and re-enable the UI regardless of success or failure.
   *
   * @param {'download' | 'print'} action
   *   'download' → save as `markdown-preview.pdf`
   *   'print'    → inject the PDF into a hidden iframe and call `window.print()`
   */
  static async exportDocument(action) {
    // ── 1. UI: show progress, lock buttons ───────────────────────────────────
    els.pdfDirectBtn.disabled = true;
    els.pdfPrintBtn.disabled = true;
    UIManager.setPdfProgress(0.02, '');
    els.pdfProgressText.textContent = 'Preparing content...';
    els.pdfProgress.classList.remove('hidden');

    // A4 dimensions and margin constants — kept here so the PDF config object can
    // be built in one place before being passed down to the render service
    const pageW  = 210;  // A4 width  in mm
    const pageH  = 297;  // A4 height in mm
    const margin = 24;   // ~1 inch (25.4 mm) — standard document margin
    const printW = pageW - margin * 2;  // 162 mm printable width
    const printH = pageH - margin * 2;  // 249 mm printable height

    let clone = null;

    try {
      // ── 2a. Clone the preview pane with strict light-mode styles ─────────
      clone = PdfCloneService.build();

      const elW = clone.offsetWidth;
      const elH = clone.scrollHeight;
      if (!elW || !elH) throw new Error('Nothing to render — the preview appears to be empty.');

      // ── 2b. Compute the pixel / mm ratio from the clone's known CSS width ─
      const pxPerMm = PdfLayoutService.computePxPerMm(clone, printW);

      // ── 2c. Lock SVG/image dimensions before measuring break boundaries ───
      // Must happen BEFORE computePageBreaks so getBoundingClientRect is accurate
      PdfLayoutService.lockElementDimensions(clone, pxPerMm, printH);

      // ── 2d. Calculate where we can safely break between pages ─────────────
      const pageStarts = PdfLayoutService.computePageBreaks(clone, elH, pxPerMm, printH);

      // ── 3. Render the entire clone onto one big 2× canvas ─────────────────
      els.pdfProgressText.textContent = 'Rendering document...';
      // Small delay so the browser can repaint the progress bar before the
      // synchronous html2canvas work begins
      await new Promise((r) => setTimeout(r, 50));
      const fullCanvas = await PdfRenderService.renderCanvas(clone, elW, elH);

      // ── 4. Slice canvas into pages and build the PDF ───────────────────────
      els.pdfProgressText.textContent = 'Building PDF...';

      // Read header/footer preferences from the modal UI
      const config = {
        pageW,
        pageH,
        margin,
        printW,
        includeHeader: els.optHeader.checked,
        headerTitle:   els.optHeaderTitle.value.trim() || 'Markdown Previewer',
        includeFooter: els.optFooter.checked,
      };

      const pdf = await PdfRenderService.buildPdf(
        fullCanvas,
        pageStarts,
        pxPerMm,
        config,
        // Progress callback: update the modal progress bar after each page
        (frac, label) => UIManager.setPdfProgress(frac, label)
      );

      // ── 5. Deliver the finished PDF to the user ────────────────────────────
      if (action === 'download') {
        els.pdfProgressText.textContent = 'Saving file...';
        UIManager.setPdfProgress(1, '');
        await new Promise((r) => setTimeout(r, 0));
        pdf.save('markdown-preview.pdf');

      } else if (action === 'print') {
        els.pdfProgressText.textContent = 'Opening print dialog...';
        UIManager.setPdfProgress(1, '');
        await new Promise((r) => setTimeout(r, 0));

        // Inject the PDF as a Blob URL into a hidden iframe, then call print().
        // This uses the browser's native PDF viewer so the user sees a proper
        // print dialog with correct page sizing rather than a raw binary download.
        const blobUrl = pdf.output('bloburl');
        const iframe  = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = blobUrl;
        document.body.appendChild(iframe);
        iframe.onload = () => setTimeout(() => iframe.contentWindow.print(), 100);
      }

      UIManager.closePdfModal();

    } catch (err) {
      // Surface errors inside the progress bar rather than silently failing
      console.error('PDF generation failed:', err);
      els.pdfProgressText.textContent = `Error: ${err.message}`;
      UIManager.setPdfProgress(0, '');

    } finally {
      // ── 6. Always clean up ─────────────────────────────────────────────────
      els.pdfDirectBtn.disabled = false;
      els.pdfPrintBtn.disabled = false;
      // Remove the off-screen DOM clone to free memory
      PdfCloneService.destroy(clone);
    }
  }
}
