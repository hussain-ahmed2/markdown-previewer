import { els } from '../../utils/dom.js';
import { debounce } from '../../utils/helpers.js';
import { MarkdownRenderer } from '../preview/MarkdownRenderer.js';
import { DocumentStore } from '../storage/DocumentStore.js';

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
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        els.editor.value = e.target.result;
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
