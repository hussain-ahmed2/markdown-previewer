# ✍️ Markdown Previewer

A fast, feature-rich markdown previewer with live editing, syntax highlighting, Mermaid diagrams, dark mode, and multi-format export — all running in your browser.

**[🔗 Live Demo →](https://hussain-ahmed2.github.io/markdown-previewer/)**

---

## ✨ Features

| Feature | Description |
|---|---|
| 📝 **Live Preview** | See your markdown rendered instantly as you type |
| 🌙 **Dark Mode** | Full dark mode support with automatic OS detection |
| 📊 **Mermaid Diagrams** | Flowcharts, sequence diagrams, gantt charts & more |
| 🎨 **Syntax Highlighting** | Code blocks with language-aware highlighting via highlight.js |
| 📄 **PDF Export** | High-fidelity A4 PDF generation with headers, footers & page numbers |
| 🖨️ **Print** | Browser-native print with automatic light mode conversion |
| 🖼️ **PNG Export** | Export your document as a high-resolution image |
| 📋 **GitHub Flavored Markdown** | Tables, task lists, strikethrough, alerts/callouts & more |
| 💾 **Auto-Save** | Your work is automatically saved to localStorage |
| 📱 **Responsive** | Works on desktop and mobile devices |

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm

### Installation

```bash
git clone https://github.com/hussain-ahmed2/markdown-previewer.git
cd markdown-previewer
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
```

The output will be in the `dist/` directory.

## 🛠️ Tech Stack

- **[Vite](https://vitejs.dev/)** — Lightning-fast build tool
- **[TypeScript](https://www.typescriptlang.org/)** — Type-safe JavaScript
- **[Tailwind CSS v4](https://tailwindcss.com/)** — Utility-first CSS framework
- **[marked](https://marked.js.org/)** — Markdown parser
- **[highlight.js](https://highlightjs.org/)** — Syntax highlighting
- **[Mermaid](https://mermaid.js.org/)** — Diagrams and charts
- **[html-to-image](https://github.com/bubkoo/html-to-image)** — DOM-to-image conversion
- **[jsPDF](https://github.com/parallax/jsPDF)** — PDF generation

## 📁 Project Structure

```
src/
├── features/
│   ├── editor/          # Markdown text editor
│   ├── export/          # PDF, PNG & print export
│   │   └── services/    # Clone, layout & render services
│   ├── preview/         # Live markdown rendering
│   ├── storage/         # localStorage persistence
│   └── ui/              # Theme toggle, modals & dropdowns
├── utils/               # DOM helpers & utilities
├── main.ts              # Application entry point
└── style.css            # Global styles & Tailwind config
```

## 📝 Supported Markdown

- Headings, paragraphs, bold, italic, strikethrough
- Ordered & unordered lists, task lists
- Code blocks with syntax highlighting
- Tables with alternating row colors
- Blockquotes
- Images & links
- Horizontal rules
- GitHub-style alerts (Note, Tip, Important, Warning, Caution)
- Mermaid diagrams (`graph`, `sequenceDiagram`, `gantt`, etc.)
- Definition lists
- Highlighted text (`==highlight==`)
- Collapsible sections (`<details>`)

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 👤 Author

**Hussain Ahmed** — [@hussain-ahmed2](https://github.com/hussain-ahmed2)
