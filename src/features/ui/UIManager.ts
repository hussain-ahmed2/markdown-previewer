import { els } from "../../utils/dom.ts";

/**
 * Manages the UI state, theme toggling, and modal interactions.
 * Centralizes DOM event listeners that don't belong to the Editor or Previewer.
 */
export class UIManager {
  /**
   * Initializes the UI manager by setting up the theme and global event listeners.
   */
  static init() {
    this.initTheme();
    this.setupEventListeners();
    this.setupDropdowns();
  }

  static setupDropdowns() {
    els.exportMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isExpanded = els.exportMenuBtn.getAttribute("aria-expanded") === "true";
      els.exportMenuBtn.setAttribute("aria-expanded", (!isExpanded).toString());
      els.exportMenu.classList.toggle("hidden");
    });

    document.addEventListener("click", (e) => {
      if (!els.exportDropdown?.contains(e.target as Node)) {
        els.exportMenuBtn.setAttribute("aria-expanded", "false");
        els.exportMenu.classList.add("hidden");
      }
    });
  }

  /**
   * Detects the user's system preference or local storage preference for dark/light mode
   * and applies the appropriate class to the HTML document.
   */
  static initTheme() {
    const isDark =
      localStorage.getItem("theme") === "dark" ||
      (!("theme" in localStorage) &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  /**
   * Toggles the current theme between dark and light mode,
   * updating both the DOM and LocalStorage.
   */
  static toggleTheme() {
    if (document.documentElement.classList.contains("dark")) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    }
    window.dispatchEvent(new Event('themechange'));
  }

  /**
   * Opens the PDF Export modal dialog.
   */
  static openPdfModal() {
    els.pdfModal.classList.remove("hidden");
    els.optHeaderTitle.value = "";
    
    // Close the dropdown menu if it's open
    if (els.exportMenuBtn && els.exportMenu) {
      els.exportMenuBtn.setAttribute("aria-expanded", "false");
      els.exportMenu.classList.add("hidden");
    }
  }

  /**
   * Closes the PDF Export modal dialog and resets its progress UI.
   */
  static closePdfModal() {
    els.pdfModal.classList.add("hidden");
    els.pdfProgress.classList.add("hidden");
    els.pdfProgressText.textContent = "";
    els.pdfProgressCount.textContent = "";
    els.pdfProgressBar.style.width = "0%";
  }

  /**
   * Updates the progress bar inside the PDF export modal.
   * @param {number} frac - A fraction representing progress (0.0 to 1.0).
   * @param {string} label - A text label to display next to the progress bar (e.g., '1 / 5').
   */
  static setPdfProgress(frac: number, label: string) {
    els.pdfProgressBar.style.width = Math.round(frac * 100) + "%";
    els.pdfProgressCount.textContent = label;
  }

  /**
   * Registers global UI event listeners such as theme toggling, opening/closing the modal,
   * and opening the file picker.
   */
  static setupEventListeners() {
    els.themeToggle.addEventListener("click", () => this.toggleTheme());
    els.downloadPdfBtn.addEventListener("click", () => this.openPdfModal());
    els.pdfCancelBtn.addEventListener("click", () => this.closePdfModal());
    els.pdfModalBackdrop.addEventListener("click", () => this.closePdfModal());

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.pdfModal.classList.contains("hidden")) {
        this.closePdfModal();
      }
    });

    els.openFileBtn.addEventListener("click", () => els.fileInput.click());
  }
}
