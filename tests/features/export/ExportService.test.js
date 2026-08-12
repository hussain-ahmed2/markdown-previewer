import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExportService } from '../../../src/features/export/ExportService.js';
import { els } from '../../../src/utils/dom.js';

vi.mock('../../../src/utils/dom.js', () => ({
  els: {
    preview: document.createElement('div'),
    editor: { value: '' },
    exportMenuBtn: document.createElement('button'),
    exportMenu: document.createElement('div'),
  }
}));

describe('ExportService', () => {
  let appendChildSpy, removeChildSpy, clickSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup preview DOM for SVGs
    els.preview.innerHTML = `
      <div class="content">
        <div class="mermaid-diagram">
          <svg id="test-svg" width="100" height="100"></svg>
        </div>
        <pre><code>some code</code></pre>
        <blockquote>Quote</blockquote>
      </div>
    `;
    els.editor.value = '# Test Markdown';

    // Mock link clicking
    clickSpy = vi.fn();
    const mockAnchor = {
      href: '',
      download: '',
      click: clickSpy
    };
    
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'a') return mockAnchor;
      if (tagName === 'canvas') {
        const canvas = originalCreateElement('canvas');
        canvas.toDataURL = () => 'data:image/png;base64,mock';
        return canvas;
      }
      return originalCreateElement(tagName);
    });

    // Mock alert to prevent test crashes if an error is caught
    window.alert = vi.fn();
  });

  describe('exportMarkdown()', () => {
    it('should create a Blob from editor text and trigger download', () => {
      ExportService.exportMarkdown();
      
      expect(window.URL.createObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('exportImage()', () => {
    it('should call htmlToImage and trigger download', async () => {
      await ExportService.exportImage();
      
      expect(window.htmlToImage.toPng).toHaveBeenCalledWith(els.preview, expect.any(Object));
      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(window.alert).not.toHaveBeenCalled();
    });
  });

  describe('exportDocx()', () => {
    it('should convert SVGs to images, apply styles, and call htmlDocx', async () => {
      await ExportService.exportDocx();
      
      // Should have called htmlToImage.toPng to rasterize the <svg>
      expect(window.htmlToImage.toPng).toHaveBeenCalled();
      
      // Should have called htmlDocx.asBlob
      expect(window.htmlDocx.asBlob).toHaveBeenCalled();
      
      const htmlPassedToDocx = window.htmlDocx.asBlob.mock.calls[0][0];
      
      // The SVG should have been replaced with an img tag
      expect(htmlPassedToDocx).not.toContain('<svg');
      expect(htmlPassedToDocx).toContain('<img');
      expect(htmlPassedToDocx).toContain('data:image/png;base64,mock');
      
      // Should trigger download
      expect(clickSpy).toHaveBeenCalled();
    });
  });
});
