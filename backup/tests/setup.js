import { vi } from 'vitest';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock CDN globals that would normally be loaded via script tags
window.marked = {
  parse: vi.fn((text) => `<p>${text}</p>`),
  use: vi.fn(),
};

window.DOMPurify = {
  sanitize: vi.fn((html) => html),
};

window.mermaid = {
  initialize: vi.fn(),
  run: vi.fn(),
};

window.htmlToImage = {
  toPng: vi.fn(() => Promise.resolve('data:image/png;base64,mock'))
};
window.jspdf = { jsPDF: vi.fn() };
window.htmlDocx = { asBlob: vi.fn(() => new Blob(['mock'], { type: 'application/docx' })) };
window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
window.URL.revokeObjectURL = vi.fn();
