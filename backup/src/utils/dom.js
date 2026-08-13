/**
 * Centralized registry of DOM elements used throughout the application.
 * Caching these references prevents repeated and expensive DOM queries.
 * @type {Object<string, HTMLElement>}
 */
export const els = {
  editor: document.getElementById('editor'),
  preview: document.getElementById('preview'),
  
  // Toolbar
  themeToggle: document.getElementById('themeToggle'),
  sunIcon: document.getElementById('sunIcon'),
  moonIcon: document.getElementById('moonIcon'),
  loadExampleBtn: document.getElementById('loadExample'),
  openFileBtn: document.getElementById('openFile'),
  fileInput: document.getElementById('fileInput'),
  exportDropdown: document.getElementById('exportDropdown'),
  exportMenuBtn: document.getElementById('exportMenuBtn'),
  exportMenu: document.getElementById('exportMenu'),
  downloadPdfBtn: document.getElementById('downloadPdf'),
  exportImage: document.getElementById('exportImage'),
  exportDocx: document.getElementById('exportDocx'),
  exportMd: document.getElementById('exportMd'),

  // Modals
  pdfModal: document.getElementById('pdfModal'),
  pdfModalBackdrop: document.getElementById('pdfModalBackdrop'),
  pdfCancelBtn: document.getElementById('pdfCancelBtn'),
  pdfDirectBtn: document.getElementById('pdfDirectBtn'),
  pdfPrintBtn: document.getElementById('pdfPrintBtn'),
  pdfProgress: document.getElementById('pdfProgress'),
  pdfProgressBar: document.getElementById('pdfProgressBar'),
  pdfProgressText: document.getElementById('pdfProgressText'),
  pdfProgressCount: document.getElementById('pdfProgressCount'),
  optHeader: document.getElementById('optHeader'),
  optHeaderTitle: document.getElementById('optHeaderTitle'),
  optFooter: document.getElementById('optFooter'),
  optHeaderBorder: document.getElementById('optHeaderBorder'),
  optFooterBorder: document.getElementById('optFooterBorder'),
  optFontFamily: document.getElementById('optFontFamily'),
  optFontSize: document.getElementById('optFontSize'),
  optTextColor: document.getElementById('optTextColor'),
  optPadding: document.getElementById('optPadding'),
  optFooterText: document.getElementById('optFooterText'),
  optFooterAlign: document.getElementById('optFooterAlign')
};
