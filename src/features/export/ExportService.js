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
   * Exports the preview as a PNG image using html2canvas.
   */
  static async exportImage() {
    this.closeDropdown();
    
    try {
      const canvas = await html2canvas(els.preview, {
        scale: 2,
        useCORS: true,
        backgroundColor: document.documentElement.classList.contains("dark") ? "#111827" : "#ffffff",
        windowWidth: document.documentElement.clientWidth,
        // When capturing scrolling elements, ensure we capture the full scroll height
        windowHeight: els.preview.scrollHeight,
        onclone: (clonedDoc, clonedElement) => {
          // html2canvas passes (document, element) to onclone in newer versions, 
          // but we can also just query it from the cloned document.
          const previewClone = clonedDoc.getElementById('preview');
          if (previewClone) {
            // Remove constraints so it can expand fully in the clone iframe
            previewClone.style.height = 'auto';
            previewClone.style.maxHeight = 'none';
            previewClone.style.overflow = 'visible';
            
            // Also ensure parents don't clip it
            let parent = previewClone.parentElement;
            while (parent && parent !== clonedDoc.body) {
              parent.style.height = 'auto';
              parent.style.maxHeight = 'none';
              parent.style.overflow = 'visible';
              parent = parent.parentElement;
            }
          }
        }
      });
      
      const dataUrl = canvas.toDataURL("image/png");
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
      const liveSvgs = Array.from(els.preview.querySelectorAll("svg"));
      const tempSvgs = Array.from(tempDiv.querySelectorAll("svg"));

      for (let i = 0; i < liveSvgs.length; i++) {
        const liveSvg = liveSvgs[i];
        const tempSvg = tempSvgs[i];

        try {
          // html2canvas works best on elements currently in the document
          const canvas = await html2canvas(liveSvg, {
            scale: 2,
            useCORS: true,
            backgroundColor: document.documentElement.classList.contains("dark") ? "#111827" : "#ffffff",
          });
          
          const pngBase64 = canvas.toDataURL("image/png");
          const newImg = document.createElement("img");
          newImg.src = pngBase64;
          // DOCX parsers often ignore CSS for images and require explicit width/height attributes
          newImg.setAttribute("width", Math.floor(canvas.width / 2));
          newImg.setAttribute("height", Math.floor(canvas.height / 2));
          
          tempSvg.parentNode.replaceChild(newImg, tempSvg);
        } catch (err) {
          console.error("Failed to rasterize SVG via html2canvas", err);
          // If we can't rasterize it, remove it so it doesn't dump raw CSS/text into the DOCX
          tempSvg.parentNode.removeChild(tempSvg);
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
