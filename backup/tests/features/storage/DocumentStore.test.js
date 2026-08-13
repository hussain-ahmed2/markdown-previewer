import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocumentStore } from '../../../src/features/storage/DocumentStore.js';
import { els } from '../../../src/utils/dom.js';

vi.mock('../../../src/utils/dom.js', () => ({
  els: {
    editor: { value: '' }
  }
}));

describe('DocumentStore', () => {
  beforeEach(() => {
    localStorage.clear();
    els.editor.value = '';
  });

  describe('load()', () => {
    it('should return false if nothing is in localStorage', () => {
      const result = DocumentStore.load();
      expect(result).toBe(false);
      expect(els.editor.value).toBe('');
    });

    it('should return true and update editor value if content exists', () => {
      localStorage.setItem('markdown-content', '# Test');
      const result = DocumentStore.load();
      
      expect(result).toBe(true);
      expect(els.editor.value).toBe('# Test');
    });
  });

  describe('save()', () => {
    it('should save current editor value to localStorage', () => {
      els.editor.value = '## New Content';
      DocumentStore.save();
      
      expect(localStorage.getItem('markdown-content')).toBe('## New Content');
    });
  });

  describe('loadExample()', () => {
    it('should load example content and save it', () => {
      DocumentStore.loadExample();
      
      expect(els.editor.value).toContain('Markdown Previewer — Complete Example');
      expect(localStorage.getItem('markdown-content')).toContain('Markdown Previewer — Complete Example');
    });
  });
});
