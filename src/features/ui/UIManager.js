import { els } from "../../utils/dom.js";

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
  }

  /**
   * Opens the PDF Export modal dialog.
   */
  static openPdfModal() {
    els.pdfModal.classList.remove("hidden");
    els.optHeaderTitle.value = "";
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
  static setPdfProgress(frac, label) {
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
