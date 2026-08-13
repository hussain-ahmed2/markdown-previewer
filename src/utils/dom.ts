/**
 * Centralized registry of DOM elements used throughout the application.
 * Caching these references prevents repeated and expensive DOM queries.
 * @type {Object<string, HTMLElement>}
 */
export const els = {
  editor: document.getElementById('editor') as HTMLTextAreaElement,
  preview: document.getElementById('preview') as HTMLDivElement,
  
  // Toolbar
  themeToggle: document.getElementById('themeToggle') as HTMLButtonElement,
  sunIcon: document.getElementById('sunIcon') as unknown as SVGElement,
  moonIcon: document.getElementById('moonIcon') as unknown as SVGElement,
  loadExampleBtn: document.getElementById('loadExample') as HTMLButtonElement,
  openFileBtn: document.getElementById('openFile') as HTMLButtonElement,
  fileInput: document.getElementById('fileInput') as HTMLInputElement,
  exportDropdown: document.getElementById('exportDropdown') as HTMLDivElement,
  exportMenuBtn: document.getElementById('exportMenuBtn') as HTMLButtonElement,
  exportMenu: document.getElementById('exportMenu') as HTMLDivElement,
  downloadPdfBtn: document.getElementById('downloadPdf') as HTMLButtonElement,
  exportImage: document.getElementById('exportImage') as HTMLButtonElement,
  exportDocx: document.getElementById('exportDocx') as HTMLButtonElement,
  exportMd: document.getElementById('exportMd') as HTMLButtonElement,

  // Modals
  pdfModal: document.getElementById('pdfModal') as HTMLDivElement,
  pdfModalBackdrop: document.getElementById('pdfModalBackdrop') as HTMLDivElement,
  pdfCancelBtn: document.getElementById('pdfCancelBtn') as HTMLButtonElement,
  pdfDirectBtn: document.getElementById('pdfDirectBtn') as HTMLButtonElement,
  pdfPrintBtn: document.getElementById('pdfPrintBtn') as HTMLButtonElement,
  pdfProgress: document.getElementById('pdfProgress') as HTMLDivElement,
  pdfProgressBar: document.getElementById('pdfProgressBar') as HTMLDivElement,
  pdfProgressText: document.getElementById('pdfProgressText') as HTMLSpanElement,
  pdfProgressCount: document.getElementById('pdfProgressCount') as HTMLSpanElement,
  optHeader: document.getElementById('optHeader') as HTMLInputElement,
  optHeaderTitle: document.getElementById('optHeaderTitle') as HTMLInputElement,
  optFooter: document.getElementById('optFooter') as HTMLInputElement,
  optHeaderBorder: document.getElementById('optHeaderBorder') as HTMLInputElement,
  optFooterBorder: document.getElementById('optFooterBorder') as HTMLInputElement,
  optFontFamily: document.getElementById('optFontFamily') as HTMLSelectElement,
  optFontSize: document.getElementById('optFontSize') as HTMLInputElement,
  optTextColor: document.getElementById('optTextColor') as HTMLInputElement,
  optPadding: document.getElementById('optPadding') as HTMLInputElement,
  optFooterText: document.getElementById('optFooterText') as HTMLInputElement,
  optFooterAlign: document.getElementById('optFooterAlign') as HTMLSelectElement,

  // Resize handle
  dragHandle: document.getElementById('dragHandle') as HTMLDivElement,
};
