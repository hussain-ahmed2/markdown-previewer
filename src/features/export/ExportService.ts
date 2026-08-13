import { els } from '../../utils/dom.ts';
import * as htmlToImage from 'html-to-image';

export class ExportService {
  /**
   * Initializes event listeners for the non-PDF export options.
   */
  static init() {
    els.exportImage?.addEventListener("click", () => this.exportImage());
    els.exportDocx?.addEventListener("click", () => this.exportDocx());
    els.exportMd?.addEventListener("click", () => this.exportMarkdown());
  }

  /**
   * Exports the preview as a PNG image using html-to-image.
   */
  static async exportImage() {
    this.closeDropdown();
    
    try {
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        try {
          const res = await originalFetch(...args);
          if (!res.ok) throw new Error('Not ok');
          return res;
        } catch (e) {
          // Return a transparent 1x1 PNG for broken/CORS images
          return new Response(
            new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,11,73,68,65,84,120,218,99,96,0,0,0,2,0,1,226,38,5,155,0,0,0,0,73,69,78,68,174,66,96,130])], { type: 'image/png' })
          );
        }
      };

      // Create an offscreen clone to ensure perfect padding and no scrollbars/shadows
      const clone = els.preview.cloneNode(true) as HTMLElement;
      clone.classList.remove("shadow-sm", "m-4", "rounded-lg", "overflow-y-auto");
      clone.style.margin = "0";
      clone.style.boxShadow = "none";
      clone.style.overflow = "visible";
      clone.style.height = "auto";
      clone.style.maxHeight = "none";
      // Lock width to the current visible width of the preview pane (minus scrollbars)
      clone.style.width = `${els.preview.clientWidth}px`; 
      // Add uniform padding so the exported image looks like a nice document
      clone.style.padding = "40px";
      
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.top = "-99999px";
      container.style.left = "-99999px";
      container.appendChild(clone);
      document.body.appendChild(container);

      let dataUrl;
      try {
        dataUrl = await htmlToImage.toPng(clone, {
          pixelRatio: 2,
          backgroundColor: document.documentElement.classList.contains("dark") ? "#111827" : "#ffffff",
        });
      } finally {
        window.fetch = originalFetch;
        document.body.removeChild(container);
      }
      
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "markdown-preview.png";
      a.click();
    } catch (err) {
      console.error("Failed to export image:", err);
      alert("Failed to export image. See console for details.");
    }
  }

  /**
   * Exports the preview HTML as a DOCX document using docshift.
   */
  static async exportDocx() {
    this.closeDropdown();
    
    try {
      // Create a temporary container to manipulate the DOM before DOCX conversion
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = els.preview.innerHTML;

      // 1. Convert SVGs (like Mermaid diagrams) to Base64 PNG Images
      // DOCX parsers often ignore or mangle raw SVGs, resulting in CSS text dumps.
      // We rasterize them using html2canvas from the LIVE DOM, then replace in tempDiv.
      const liveDiagrams = Array.from(els.preview.querySelectorAll(".mermaid-diagram")) as HTMLElement[];
      const tempDiagrams = Array.from(tempDiv.querySelectorAll(".mermaid-diagram")) as HTMLElement[];

      for (let i = 0; i < liveDiagrams.length; i++) {
        const liveDiagram = liveDiagrams[i];
        const tempDiagram = tempDiagrams[i];

        try {
          const pngBase64 = await htmlToImage.toPng(liveDiagram, {
            pixelRatio: 2,
            backgroundColor: document.documentElement.classList.contains("dark") ? "#111827" : "#ffffff",
          });
          
          const newImg = document.createElement("img");
          newImg.src = pngBase64;
          
          // Compute width and height manually since htmlToImage doesn't return a canvas object
          const rect = liveDiagram.getBoundingClientRect();
          let imgWidth = Math.floor(rect.width);
          let imgHeight = Math.floor(rect.height);
          
          // Cap width to prevent cropping in MS Word (A4 printable width is ~600px)
          const MAX_WIDTH = 600;
          if (imgWidth > MAX_WIDTH) {
            const ratio = MAX_WIDTH / imgWidth;
            imgWidth = MAX_WIDTH;
            imgHeight = Math.floor(imgHeight * ratio);
          }

          // DOCX parsers require explicit width/height attributes
          newImg.setAttribute("width", imgWidth.toString());
          newImg.setAttribute("height", imgHeight.toString());
          
          // Keep styles as a fallback for smart parsers
          newImg.style.maxWidth = "100%";
          newImg.style.height = "auto";
          newImg.style.display = "block";
          newImg.style.margin = "0 auto";
          
          // Replace the diagram container's content with the image
          tempDiagram.innerHTML = "";
          tempDiagram.appendChild(newImg);
        } catch (err) {
          console.error("Failed to rasterize diagram via html2canvas", err);
          // If we can't rasterize it, remove it so it doesn't dump raw CSS/text into the DOCX
          tempDiagram.parentNode!.removeChild(tempDiagram);
        }
      }

      // 2. Inline basic formatting for accuracy
      // Client-side DOCX converters rely heavily on inline styles since they don't load external CSS classes (like Tailwind)
      const preBlocks = tempDiv.querySelectorAll("pre");
      preBlocks.forEach((pre) => {
        pre.style.backgroundColor = "#f6f8fa";
        pre.style.color = "#24292e";
        pre.style.padding = "16px";
        pre.style.borderRadius = "8px";
        pre.style.fontFamily = "monospace";
        pre.style.whiteSpace = "pre-wrap";
      });

      const blockquotes = tempDiv.querySelectorAll("blockquote");
      blockquotes.forEach((bq) => {
        bq.style.borderLeft = "4px solid #e5e7eb";
        bq.style.paddingLeft = "16px";
        bq.style.color = "#6b7280";
        bq.style.fontStyle = "italic";
      });

      // html-docx-js expects the HTML string to convert
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Markdown Export</title>
          </head>
          <body>
            ${tempDiv.innerHTML}
          </body>
        </html>
      `;
      
      const docxBlob = (window as any).htmlDocx.asBlob(htmlContent);
      const fileUrl = URL.createObjectURL(docxBlob);
      const a = document.createElement("a");
      a.href = fileUrl;
      a.download = "markdown-preview.docx";
      a.click();
      URL.revokeObjectURL(fileUrl);
    } catch (err) {
      console.error("Failed to export DOCX:", err);
      alert("Failed to export DOCX. Make sure html-docx-js is loaded.");
    }
  }

  /**
   * Exports the raw Markdown editor content to a .md file.
   */
  static exportMarkdown() {
    this.closeDropdown();
    
    const text = els.editor.value;
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = "markdown-preview.md";
    a.click();
    
    URL.revokeObjectURL(url);
  }
  
  static closeDropdown() {
    if (els.exportMenuBtn && els.exportMenu) {
      els.exportMenuBtn.setAttribute("aria-expanded", "false");
      els.exportMenu.classList.add("hidden");
    }
  }
}
