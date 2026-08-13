import { els } from '../../utils/dom.js';

/**
 * Handles the compilation of raw Markdown into safe HTML.
 * Responsible for configuring the markdown parser, syntax highlighter, and Mermaid engine.
 */
export class MarkdownRenderer {
  /**
   * Initializes the markdown renderer by configuring external libraries.
   */
  static init() {
    this.configureMarked();
    this.configureMermaid();
  }

  /**
   * Configures the `marked.js` library to support GitHub Flavored Markdown (GFM)
   * and delegates code block styling to `highlight.js`.
   */
  static configureMarked() {
    marked.setOptions({
      highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      },
      breaks: true,
      gfm: true
    });
  }

  /**
   * Configures the Mermaid.js engine to not run automatically, allowing
   * this module to manually trigger rendering after DOM purification.
   */
  static configureMermaid() {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose'
    });
  }

  /**
   * Parses raw markdown, sanitizes the HTML output, highlights code blocks,
   * asynchronously renders Mermaid diagrams, and injects the final result into the preview pane.
   * 
   * @param {string} markdown - The raw markdown text to parse.
   */
  static async render(markdown) {
    try {
      const rawHtml = marked.parse(markdown);
      
      const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
        ADD_TAGS: ['iframe', 'details', 'summary'],
        ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling']
      });

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = sanitizedHtml;

      const codeBlocks = tempDiv.querySelectorAll('code.language-mermaid');
      for (let i = 0; i < codeBlocks.length; i++) {
        const codeBlock = codeBlocks[i];
        const graphDefinition = codeBlock.textContent;
        const preNode = codeBlock.parentNode;
        
        try {
          const id = `mermaid-${Date.now()}-${i}`;
          const { svg } = await mermaid.render(id, graphDefinition);
          
          const wrapper = document.createElement('div');
          wrapper.className = 'mermaid-diagram';
          wrapper.innerHTML = svg;
          
          preNode.parentNode.replaceChild(wrapper, preNode);
        } catch (error) {
          console.error('Mermaid rendering failed:', error);
          const errorNode = document.createElement('div');
          errorNode.className = 'mermaid-error';
          errorNode.textContent = 'Diagram syntax error';
          preNode.parentNode.replaceChild(errorNode, preNode);
        }
      }

      els.preview.innerHTML = tempDiv.innerHTML;
    } catch (err) {
      console.error('Render error:', err);
    }
  }
}
