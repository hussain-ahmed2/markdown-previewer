import * as htmlToImage from "html-to-image";
import { Packer } from "docx";
import { els } from "../../utils/dom.ts";
import { MarkdownRenderer } from "../preview/MarkdownRenderer.ts";
import { DocxConverterService } from "./services/DocxConverterService.ts";
import type { DocxRasterAsset } from "./services/DocxConverterService.ts";

/**
 * @module DocxExporter
 *
 * Fully self-contained DOCX export feature. This module owns every part of the
 * Word export so it can be added or removed WITHOUT touching the rest of the
 * application:
 *
 *   - It binds its own click handler to the #exportDocxNew button (a separate
 *     button id from the legacy #exportDocx, so it never conflicts with the
 *     existing export code).
 *   - All DOM reads/writes are local to the off-screen clone it creates.
 *   - Mermaid's global state is restored after the diagrams are rasterized.
 *
 * Pipeline:
 *  1. Force a fresh render of the current editor content.
 *  2. Clone the preview into an off-screen container.
 *  3. Re-render Mermaid diagrams in the light theme, then restore the original
 *     Mermaid theme so no global state leaks.
 *  4. Inline external images (dropped if they fail CORS).
 *  5. Rasterize diagrams and images to PNG and stamp each with data-docx-index.
 *  6. Convert the DOM to a standards-compliant DOCX and download it as a blob.
 */
export class DocxExporter {
  static init() {
    const button = document.getElementById("exportDocxNew");
    button?.addEventListener("click", () => this.exportDocx());
  }

  static async exportDocx() {
    this.closeDropdown();

    try {
      // Force a fresh render so the DOCX reflects the current editor content.
      await MarkdownRenderer.render(els.editor.value);

      // Clone the preview into an off-screen container. The width is locked to
      // the visible preview pane so rasterized elements keep their real size.
      const container = document.createElement("div");
      container.style.cssText =
        "position: fixed; top: 0; left: -99999px; width: 700px; overflow: visible; pointer-events: none; z-index: -9999;";

      const clone = els.preview.cloneNode(true) as HTMLElement;
      clone.style.width = `${els.preview.clientWidth || 700}px`;
      clone.style.maxHeight = "none";
      clone.style.overflow = "visible";
      container.appendChild(clone);
      document.body.appendChild(container);

      const assets = new Map<string, DocxRasterAsset>();

      try {
        await this.prepareClone(clone);
        await this.rasterizeAssets(clone, assets);

        const doc = DocxConverterService.convert(clone, assets);
        const blob = await Packer.toBlob(doc);

        const fileUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = fileUrl;
        a.download = "markdown-preview.docx";
        a.click();
        URL.revokeObjectURL(fileUrl);
      } finally {
        document.body.removeChild(container);
      }
    } catch (err) {
      console.error("Failed to export DOCX:", err);
      alert("Failed to export DOCX. See console for details.");
    }
  }

  /**
   * Prepares the clone for DOCX conversion:
   *  - Re-renders Mermaid diagrams in the light theme (dark-mode colors would
   *    otherwise be baked into the rasterized PNGs). The app's original Mermaid
   *    theme is restored afterwards so this module leaves no global state.
   *  - Inlines external images as data URLs so the DOCX has no broken links.
   */
  private static async prepareClone(clone: HTMLElement) {
    const mermaidDivs = Array.from(
      clone.querySelectorAll<HTMLElement>(".mermaid-diagram"),
    );
    if (mermaidDivs.length > 0) {
      const mermaidModule = await import("mermaid");
      const mermaidLib = mermaidModule.default;
      const wasDark = document.documentElement.classList.contains("dark");
      const originalTheme = wasDark ? "dark" : "default";

      mermaidLib.initialize({ theme: "default", startOnLoad: false });

      for (let i = 0; i < mermaidDivs.length; i++) {
        const div = mermaidDivs[i];
        const src = div.getAttribute("data-mermaid-src");
        if (!src) continue;
        try {
          const { svg } = await mermaidLib.render(
            `docx-mermaid-${Date.now()}-${i}`,
            decodeURIComponent(src),
          );
          div.innerHTML = svg;
        } catch (err) {
          console.error("Failed to re-render mermaid for DOCX", err);
        }
      }

      // Restore the app's theme so subsequent renders behave exactly as before.
      mermaidLib.initialize({ theme: originalTheme, startOnLoad: false });
    }

    const imgs = Array.from(clone.querySelectorAll<HTMLImageElement>("img"));
    for (const img of imgs) {
      const src = img.getAttribute("src") ?? "";
      if (src.startsWith("data:") || src.startsWith("blob:")) continue;
      try {
        const resp = await fetch(src);
        const blob = await resp.blob();
        img.src = await this.blobToDataUrl(blob);
      } catch (err) {
        // Cross-origin images that refuse CORS would break the DOCX — drop them.
        console.error("Failed to inline image for DOCX:", err);
        img.remove();
      }
    }
  }

  /**
   * Rasterizes `.mermaid-diagram` and `img` elements into PNG data URLs, stamps
   * each with a `data-docx-index` attribute, and records the assets so the
   * converter can embed them as ImageRuns.
   */
  private static async rasterizeAssets(
    clone: HTMLElement,
    assets: Map<string, DocxRasterAsset>,
  ) {
    const targets = Array.from(
      clone.querySelectorAll<HTMLElement>(".mermaid-diagram, img"),
    );

    for (const target of targets) {
      if (target.dataset.docxIndex !== undefined) continue;

      try {
        if (target instanceof HTMLImageElement) {
          await target.decode().catch(() => {});
        }

        const dataUrl = await htmlToImage.toPng(target, {
          pixelRatio: 2,
          backgroundColor: "#ffffff",
        });

        const rect = target.getBoundingClientRect();
        let width = Math.max(1, Math.floor(rect.width));
        let height = Math.max(1, Math.floor(rect.height));

        // Cap width to the printable area so images aren't cropped in Word.
        const MAX_WIDTH = 600;
        if (width > MAX_WIDTH) {
          const ratio = MAX_WIDTH / width;
          width = MAX_WIDTH;
          height = Math.floor(height * ratio);
        }

        const key = String(assets.size);
        target.dataset.docxIndex = key;
        assets.set(key, { dataUrl, width, height });
      } catch (err) {
        console.error("Failed to rasterize element for DOCX:", err);
        target.remove();
      }
    }
  }

  private static blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  private static closeDropdown() {
    const menu = document.getElementById("exportMenu");
    const button = document.getElementById("exportMenuBtn");
    if (menu) menu.classList.add("hidden");
    if (button) button.setAttribute("aria-expanded", "false");
  }
}

DocxExporter.init();