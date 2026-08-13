import { UIManager } from './features/ui/UIManager.js';
import { MarkdownRenderer } from './features/preview/MarkdownRenderer.js';
import { Editor } from './features/editor/Editor.js';
import { PdfGenerator } from './features/export/PdfGenerator.js';
import { ExportService } from './features/export/ExportService.js';
import { DocumentStore } from './features/storage/DocumentStore.js';

/**
 * Main Application Entry Point
 * Orchestrates the initialization of all modular features when the DOM is ready.
 */
document.addEventListener('DOMContentLoaded', () => {
  UIManager.init();
  MarkdownRenderer.init();
  Editor.init();
  PdfGenerator.init();
  ExportService.init();

  if (!DocumentStore.load()) {
    DocumentStore.loadExample();
  }

  Editor.handleInput();
});
