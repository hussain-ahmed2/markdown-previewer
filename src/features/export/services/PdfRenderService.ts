import * as htmlToImage from "html-to-image";
import { jsPDF } from "jspdf";
import mermaid from "mermaid";

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
  static async renderCanvas(clone: HTMLElement, elW: number, elH: number) {
    // To guarantee the PDF is generated in pure light mode (even if the app is in dark mode),
    // we must temporarily remove the "dark" class from the document root so that Tailwind v4
    // resolves all CSS variables to their light mode values during the capture.
    const isDark = document.documentElement.classList.contains("dark");
    let darkLink = document.getElementById("hljs-dark") as HTMLLinkElement;
    let lightLink = document.getElementById("hljs-light") as HTMLLinkElement;
    
    if (isDark) {
      document.documentElement.classList.remove("dark");
      if (darkLink) darkLink.disabled = true;
      if (lightLink) lightLink.disabled = false;
    }

    // Re-render any Mermaid diagrams embedded in the clone using the light theme.
    const mermaidDivs = clone.querySelectorAll(".mermaid-diagram");
    if (mermaidDivs.length > 0) {
      mermaid.initialize({ theme: "default", securityLevel: "loose", startOnLoad: false });
    }
    
    for (let i = 0; i < mermaidDivs.length; i++) {
      const div = mermaidDivs[i] as HTMLElement;
      const src = div.getAttribute("data-mermaid-src");
      if (src) {
        try {
          const id = `mermaid-pdf-${Date.now()}-${i}`;
          // Decode the URL-encoded source back into a string with preserved newlines
          const decodedSrc = decodeURIComponent(src);
          // Force light mode using the init directive (MUST use double quotes for valid JSON!)
          // Explicitly set "darkMode": false to prevent Mermaid from outputting @media (prefers-color-scheme: dark)
          const lightSrc = `%%{init: {"theme": "default", "darkMode": false}}%%\n${decodedSrc}`;
          const { svg } = await mermaid.render(id, lightSrc);
          div.innerHTML = svg;

          // Force browser layout so getBoundingClientRect() returns correct size
          await new Promise((r) => requestAnimationFrame(r));

          // ULTIMATE FIX: Mermaid injects a <style> block into the document head.
          // This style block often contains @media (prefers-color-scheme: dark) rules.
          // When htmlToImage captures the DOM, it copies these rules. Then, when the browser 
          // renders the resulting image to a canvas, it forces those dark rules if the OS is in dark mode!
          // We MUST physically strip the media query from the injected <style> block.
          const injectedStyle = document.getElementById(id);
          if (injectedStyle && injectedStyle.textContent) {
            injectedStyle.textContent = injectedStyle.textContent.replace(
              /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/g,
              "@media (max-width: 1px)" // A media query that will practically never match
            );
          }

          // html-to-image cannot rasterize Mermaid's freshly rendered inline SVG
          // (it carries width="100%" and no explicit height), which leaves the
          // diagram completely blank in the exported PDF. Convert it to a PNG
          // <img> of the same rendered size before the capture instead.
          await this.rasterizeDiagram(div);
        } catch (e) {
          console.error("Failed to re-render mermaid for PDF", e);
        }
      }
    }

    let dataUrl;
    try {
      // 1. Get PNG data URL using htmlToImage
      dataUrl = await htmlToImage.toPng(clone, {
        pixelRatio: 2,
        width: elW,
        height: elH,
        backgroundColor: "#ffffff",
        style: {
          width: `${elW}px`,
          height: `${elH}px`,
        },
        // A single broken <img> (offline/CORS/404) must not abort the whole PDF.
        // Substitute a transparent 1×1 pixel and swallow the image error instead
        // of letting html-to-image reject the entire export with an Event.
        imagePlaceholder:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAAAAgAB4iYFmwAAAABJRU5ErkJggg==",
        onImageErrorHandler: () => {},
      });
    } finally {
      // Restore all dark mode states immediately so the user never sees a flash
      if (isDark) {
        document.documentElement.classList.add("dark");
        if (darkLink) darkLink.disabled = false;
        if (lightLink) lightLink.disabled = true;
        
        if (mermaidDivs.length > 0) {
          mermaid.initialize({ theme: "dark", securityLevel: "loose", startOnLoad: false });
        }
      }
    }

    // 2. Load it into an Image element
    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    // 3. Draw the image onto an offscreen canvas
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");
    
    // Fill white background just in case
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    return canvas;
  }

  /**
   * Converts the freshly re-rendered Mermaid SVG inside a `.mermaid-diagram`
   * container into a rasterized PNG `<img>` of the same rendered size.
   *
   * html-to-image captures the clone via a single `<foreignObject>` SVG and fails
   * to rasterize Mermaid's inline SVGs (they carry `width="100%"` with no explicit
   * height), leaving the diagram blank in the exported PDF. Rasterising each
   * diagram to a PNG image first lets html-to-image render it reliably.
   *
   * @param {HTMLElement} div - The `.mermaid-diagram` container holding the SVG.
   */
  static async rasterizeDiagram(div: HTMLElement) {
    const svg = div.querySelector("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width <= 0 || height <= 0) return;

    const serialized = new XMLSerializer().serializeToString(svg);
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Failed to rasterize Mermaid diagram"));
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const img = document.createElement("img");
    img.src = canvas.toDataURL("image/png");
    img.style.width = `${width}px`;
    img.style.height = `${height}px`;
    div.replaceChild(img, svg);
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
  static async buildPdf(fullCanvas: HTMLCanvasElement, pageStarts: number[], pxPerMm: number, config: any, onProgress: (frac: number, label: string) => void) {
    const {
      pageW,
      pageH,
      margin,
      printW,
      includeHeader,
      headerTitle,
      includeFooter,
      footerText,
      footerAlign,
      fontFamily,
      fontSize,
      textColor,
      padding,
      headerBorder,
      footerBorder,
    } = config;
    const totalPages = pageStarts.length - 1;

    // A reusable off-screen canvas to crop each page slice into
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = fullCanvas.width; // same device-pixel width as the full canvas
    const ctx = tempCanvas.getContext("2d", { alpha: false }); // alpha: false → faster fillRect

    const pdf = new jsPDF({
      unit: "mm",
      format: "a4",
      orientation: "portrait",
    });
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
      ctx!.fillStyle = "#ffffff";
      ctx!.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      // drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh):
      //   source = full 2× canvas
      //   sy     = offsetPx × 2  (source y in 2× pixel space)
      //   sh     = slicePxH × 2  (source height in 2× pixel space)
      //   Destination fills the full tempCanvas at 1:1
      ctx!.drawImage(
        fullCanvas,
        0,
        offsetPx * 2,
        fullCanvas.width,
        slicePxH * 2, // source rect
        0,
        0,
        tempCanvas.width,
        tempCanvas.height, // dest rect
      );

      // ── Encode and insert into PDF ────────────────────────────────────────
      const imgData = tempCanvas.toDataURL("image/jpeg", 0.98);
      // Convert the slice height from CSS pixels → mm so jsPDF sizes it correctly
      const imgHeightMm = slicePxH / pxPerMm;

      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", margin, margin, printW, imgHeightMm);

      // Helper to parse hex colors
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
          ? [
              parseInt(result[1], 16),
              parseInt(result[2], 16),
              parseInt(result[3], 16),
            ]
          : [107, 114, 128]; // default gray
      };
      const [r, g, b] = hexToRgb(textColor);

      // Map font family
      let jsPdfFont = "helvetica";
      if (fontFamily.toLowerCase().includes("serif")) jsPdfFont = "times";
      if (fontFamily.toLowerCase().includes("mono")) jsPdfFont = "courier";

      // ── Optional header ───────────────────────────────────────────────────
      if (includeHeader) {
        // Separator line drawn at `padding` mm above the content top (margin)
        if (headerBorder) {
          pdf.setDrawColor(229, 231, 235);
          pdf.line(margin, margin - padding, pageW - margin, margin - padding);
        }

        pdf.setFont(jsPdfFont);
        pdf.setFontSize(fontSize);
        pdf.setTextColor(r, g, b);

        // Date on the left, title on the right, drawn roughly (padding + 4) mm above content
        const textY = margin - padding - 2;
        pdf.text(dateStr, margin, textY);
        pdf.text(headerTitle, pageW - margin, textY, { align: "right" });
      }

      // ── Optional footer ───────────────────────────────────────────────────
      if (includeFooter) {
        // Separator line drawn at `padding` mm below the content bottom
        if (footerBorder) {
          pdf.setDrawColor(229, 231, 235);
          pdf.line(
            margin,
            pageH - margin + padding,
            pageW - margin,
            pageH - margin + padding,
          );
        }

        pdf.setFont(jsPdfFont);
        pdf.setFontSize(fontSize);
        pdf.setTextColor(r, g, b);

        // Text is drawn roughly (padding + 4) mm below the border
        const textY = pageH - margin + padding + fontSize * 0.35;
        const pageStr = `Page ${i + 1} of ${totalPages}`;

        if (footerAlign === "space-between") {
          pdf.text(footerText, margin, textY, { align: "left" });
          pdf.text(pageStr, pageW - margin, textY, { align: "right" });
        } else if (footerAlign === "left") {
          pdf.text(`${footerText}   |   ${pageStr}`, margin, textY, {
            align: "left",
          });
        } else if (footerAlign === "center") {
          pdf.text(`${footerText}   |   ${pageStr}`, pageW / 2, textY, {
            align: "center",
          });
        } else if (footerAlign === "right") {
          pdf.text(`${footerText}   |   ${pageStr}`, pageW - margin, textY, {
            align: "right",
          });
        }
      }
    }

    return pdf;
  }
}
