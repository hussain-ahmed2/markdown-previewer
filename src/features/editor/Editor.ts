import { els } from '../../utils/dom.ts';
import { debounce } from '../../utils/helpers.ts';
import { MarkdownRenderer } from '../preview/MarkdownRenderer.ts';
import { DocumentStore } from '../storage/DocumentStore.ts';

/**
 * Manages the Markdown input pane, orchestrating text entry, debounced rendering,
 * and intelligent dual-pane scroll synchronization.
 */
export class Editor {
  /**
   * Initializes the editor by attaching input, scrolling, and file loading event listeners.
   */
  static init() {
    this.setupInputListener();
    this.setupScrollSync();
    this.setupFileLoader();
    
    window.addEventListener('themechange', () => this.handleInput());
  }

  /**
   * Called whenever the user modifies the text area. 
   * Triggers persistence to storage and initiates a markdown re-render.
   */
  static handleInput() {
    DocumentStore.save();
    MarkdownRenderer.render(els.editor.value);
  }

  /**
   * Attaches a debounced `input` event listener to the editor pane
   * to avoid thrashing the CPU while the user types quickly.
   */
  static setupInputListener() {
    const debouncedRender = debounce(() => this.handleInput(), 150);
    els.editor.addEventListener('input', debouncedRender);

    // Tab indent / Shift+Tab unindent
    els.editor.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();

      const { selectionStart, selectionEnd, value } = els.editor;

      if (!e.shiftKey) {
        // Insert two spaces at cursor
        els.editor.value = value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd);
        els.editor.selectionStart = els.editor.selectionEnd = selectionStart + 2;
      } else {
        // Remove up to two leading spaces from the current line
        const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const line = value.substring(lineStart);
        const spacesToRemove = line.startsWith('  ') ? 2 : line.startsWith(' ') ? 1 : 0;
        if (spacesToRemove > 0) {
          els.editor.value = value.substring(0, lineStart) + value.substring(lineStart + spacesToRemove);
          els.editor.selectionStart = els.editor.selectionEnd = Math.max(lineStart, selectionStart - spacesToRemove);
        }
      }

      this.handleInput();
    });
  }

  /**
   * Links the scroll position of the editor text area with the preview output pane.
   * Scrolling one side will proportionately scroll the other side.
   */
  static setupScrollSync() {
    let isSyncingLeft = false;
    let isSyncingRight = false;

    els.editor.addEventListener('scroll', () => {
      if (!isSyncingLeft) {
        isSyncingRight = true;
        const percentage = els.editor.scrollTop / (els.editor.scrollHeight - els.editor.clientHeight);
        els.preview.scrollTop = percentage * (els.preview.scrollHeight - els.preview.clientHeight);
      }
      isSyncingLeft = false;
    });

    els.preview.addEventListener('scroll', () => {
      if (!isSyncingRight) {
        isSyncingLeft = true;
        const percentage = els.preview.scrollTop / (els.preview.scrollHeight - els.preview.clientHeight);
        els.editor.scrollTop = percentage * (els.editor.scrollHeight - els.editor.clientHeight);
      }
      isSyncingRight = false;
    });
  }

  /**
   * Configures local file loading from the device (via file input picker)
   * and populates the editor with example placeholder data.
   */
  static setupFileLoader() {
    els.fileInput.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        els.editor.value = ev.target?.result as string;
        this.handleInput();
      };
      reader.readAsText(file);
    });

    els.loadExampleBtn.addEventListener('click', () => {
      DocumentStore.loadExample();
      this.handleInput();
    });
  }
}
