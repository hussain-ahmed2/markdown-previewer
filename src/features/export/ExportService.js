import { els } from "../../utils/dom.js";

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
      // Remove max-height constraints temporarily so the full scroll height is captured
      const originalHeight = els.preview.style.height;
      const originalMaxHeight = els.preview.style.maxHeight;
      const originalOverflow = els.preview.style.overflow;
      
      els.preview.style.height = 'auto';
      els.preview.style.maxHeight = 'none';
      els.preview.style.overflow = 'visible';

      const dataUrl = await window.htmlToImage.toPng(els.preview, {
        pixelRatio: 2,
        backgroundColor: document.documentElement.classList.contains("dark") ? "#111827" : "#ffffff",
      });
      
      // Restore styles
      els.preview.style.height = originalHeight;
      els.preview.style.maxHeight = originalMaxHeight;
      els.preview.style.overflow = originalOverflow;
      
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
      const liveDiagrams = Array.from(els.preview.querySelectorAll(".mermaid-diagram"));
      const tempDiagrams = Array.from(tempDiv.querySelectorAll(".mermaid-diagram"));

      for (let i = 0; i < liveDiagrams.length; i++) {
        const liveDiagram = liveDiagrams[i];
        const tempDiagram = tempDiagrams[i];

        try {
          const pngBase64 = await window.htmlToImage.toPng(liveDiagram, {
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
          newImg.setAttribute("width", imgWidth);
          newImg.setAttribute("height", imgHeight);
          
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
          tempDiagram.parentNode.removeChild(tempDiagram);
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
      
      const docxBlob = window.htmlDocx.asBlob(htmlContent);
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
