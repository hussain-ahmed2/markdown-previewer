# Markdown Previewer

A fast, browser-native Markdown editor and previewer that exports your documents as pixel-perfect A4 PDFs — with no backend required.

---

## Features

- **Live preview** — renders as you type via a 150 ms debounced engine
- **Complete Markdown support** — GFM, tables, task lists, footnotes, description lists, strikethrough, and raw HTML
- **Syntax highlighting** — powered by highlight.js with GitHub-style light/dark themes
- **Mermaid diagrams** — flowcharts, sequence diagrams, and more render inline
- **PDF export** — custom A4 pagination engine with smart content-aware page breaks
- **System print** — sends a perfectly formatted PDF to your printer
- **Dark / light mode** — persisted via `localStorage` and respects `prefers-color-scheme`
- **File open** — load any `.md` file from disk
- **Auto-save** — content is saved to `localStorage` on every keystroke

---

## Getting Started

Because the app uses native ES Modules (`<script type="module">`), you cannot open `index.html` directly via `file://`. You need a local HTTP server.

### Option 1 — Python (built into macOS / Linux)

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

### Option 2 — Node.js / npx

```bash
npx serve .
```

Then open the URL printed in the terminal.

---

## Project Architecture

The app is structured as a feature-based ES Module hierarchy. Every module has a single, clearly defined responsibility.

```text
markdown-previewer/
├── index.html                         # Markup skeleton only — no inline logic
├── src/
│   ├── main.js                        # Entry point: initialises all features on DOMContentLoaded
│   ├── style.css                      # Global styles, dark mode, print media queries
│   ├── utils/
│   │   ├── dom.js                     # Cached DOM element registry
│   │   └── helpers.js                 # Pure utility functions (debounce, etc.)
│   └── features/
│       ├── editor/
│       │   └── Editor.js              # Input handling, scroll sync, file loading
│       ├── preview/
│       │   └── MarkdownRenderer.js    # marked.js + DOMPurify + mermaid pipeline
│       ├── storage/
│       │   └── DocumentStore.js       # localStorage persistence layer
│       ├── ui/
│       │   └── UIManager.js           # Theme, modal, and global UI events
│       └── export/
│           ├── PdfGenerator.js        # Orchestrator — sequences the services below
│           └── services/
│               ├── PdfCloneService.js  # DOM cloning and print CSS injection
│               ├── PdfLayoutService.js # SVG scaling + page-break math
│               └── PdfRenderService.js # html2canvas rendering + jsPDF assembly
```

### Module Responsibilities

| Module | Responsibility |
|---|---|
| `main.js` | DOMContentLoaded bootstrap |
| `dom.js` | Single source of truth for all cached DOM elements |
| `helpers.js` | Reusable, side-effect-free utility functions |
| `Editor.js` | Text area input, debounced rendering, scroll synchronisation |
| `MarkdownRenderer.js` | Parse → sanitise → highlight → render Mermaid |
| `DocumentStore.js` | Read/write Markdown content to/from `localStorage` |
| `UIManager.js` | Dark mode toggle, PDF modal open/close, progress bar |
| `PdfGenerator.js` | Coordinates the three PDF services in order |
| `PdfCloneService.js` | Clones preview, strips dark mode, injects print CSS |
| `PdfLayoutService.js` | Locks SVG/img dimensions, detects safe page-break offsets |
| `PdfRenderService.js` | Renders monolithic canvas, slices per-page, builds jsPDF |

---

## PDF Engine — How It Works

The PDF export does not use the browser's built-in print dialog (which varies wildly between browsers). Instead it implements a custom A4 pagination engine:

### 1 · Clone the DOM
`PdfCloneService` deep-clones the live preview, forces light-mode styles via an injected `<style>` tag, and positions the clone off-screen at `left: -9999px`. This lets the browser compute accurate layout dimensions without disturbing the user's view.

### 2 · Lock SVG / Image Dimensions
`html2canvas` is known to ignore CSS `max-width` and `max-height` rules on SVG elements, rendering them at their raw intrinsic `viewBox` size. `PdfLayoutService.lockElementDimensions()` reads each element's live `getBoundingClientRect()` measurements, shrinks any element taller than 90% of a single A4 page, and hard-writes the computed pixel values directly into the element's `width`/`height` HTML attributes (not just CSS). This ensures the canvas snapshot and our boundary math use identical dimensions.

### 3 · Compute Page Breaks
`PdfLayoutService.computePageBreaks()` scans every block-level element in the clone and collects their top and bottom pixel offsets as "safe break boundary" candidates. It then walks forward through the document, selecting the *last* safe boundary that keeps each page at least 55% full. This prevents code blocks, headings, and diagrams from being sliced mid-element.

### 4 · Render the Monolithic Canvas
`PdfRenderService.renderCanvas()` calls `html2canvas` once on the full-height clone at `scale: 2` (2× retina resolution). One call is significantly faster and more accurate than calling it once per page.

### 5 · Slice and Assemble
`PdfRenderService.buildPdf()` iterates over the page boundaries. For each page, it uses `ctx.drawImage()` to crop a horizontal strip out of the monolithic canvas, encodes it as a JPEG at 98% quality, and inserts it into a jsPDF page at the correct margin offset. Optional header and footer decorations are drawn with jsPDF's native vector drawing API.

---

## External Libraries (CDN)

| Library | Purpose |
|---|---|
| [Tailwind CSS](https://tailwindcss.com) | Utility CSS framework |
| [marked.js](https://marked.js.org) | Markdown → HTML parser |
| [DOMPurify](https://github.com/cure53/DOMPurify) | XSS sanitisation |
| [highlight.js](https://highlightjs.org) | Syntax highlighting |
| [Mermaid.js](https://mermaid.js.org) | Diagram rendering |
| [html2canvas](https://html2canvas.hertzen.com) | DOM → canvas snapshot |
| [jsPDF](https://github.com/parallax/jsPDF) | PDF generation |
| [KaTeX](https://katex.org) | Math formula rendering |

---

## License

MIT
