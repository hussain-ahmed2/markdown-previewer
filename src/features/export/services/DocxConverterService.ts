import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  FootnoteReferenceRun,
  HeadingLevel,
  HighlightColor,
  ImageRun,
  LevelFormat,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

export interface DocxRasterAsset {
  dataUrl: string;
  width: number;
  height: number;
}

type Block = Paragraph | Table;
type Inline = TextRun | ExternalHyperlink | FootnoteReferenceRun | ImageRun;

interface RunFormat {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  highlight?: boolean;
}

interface BlockStyle {
  runFormat?: RunFormat;
  indent?: number;
  borderLeft?: { color: string; size: number };
  shading?: string;
}

interface ConverterContext {
  assets: ReadonlyMap<string, DocxRasterAsset>;
  footnotes: Record<string, { children: Paragraph[] }>;
}

const MONO_FONT = "Consolas";
const MONO_SIZE = 19; // half-points → 9.5pt
const BODY_SIZE = 22; // half-points → 11pt
const CODE_FILL = "F6F8FA";
const CODE_TEXT = "24292E";

const HEADING_MAP: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
  h4: HeadingLevel.HEADING_4,
  h5: HeadingLevel.HEADING_5,
  h6: HeadingLevel.HEADING_6,
};

const ALERT_COLORS: Record<string, string> = {
  note: "1F4E79",
  tip: "1E7E34",
  important: "5B21B6",
  warning: "9A6700",
  caution: "B42318",
};

/**
 * @module DocxConverterService
 *
 * Converts the sanitized preview DOM into a standards-compliant OOXML DOCX
 * document using the `docx` library. Everything runs fully in the browser and
 * offline — no CDN scripts required.
 *
 * The converter is theme-independent: it reads only the DOM structure and text
 * content of the preview, so light/dark mode never affects the output. Diagrams
 * and images are embedded as pre-rasterized PNG assets supplied by the caller
 * (keyed by the `data-docx-index` attribute stamped on each element).
 */
export class DocxConverterService {
  static convert(
    preview: HTMLElement,
    assets: ReadonlyMap<string, DocxRasterAsset>,
  ): Document {
    const ctx: ConverterContext = { assets, footnotes: {} };

    const blocks: Block[] = [];
    for (const child of Array.from(preview.childNodes)) {
      this.appendBlocks(child, ctx, blocks, {});
    }

    return new Document({
      creator: "Markdown Previewer",
      title: "Markdown Export",
      description: "Exported from Markdown Previewer",
      styles: {
        default: {
          document: {
            run: { font: "Calibri", size: BODY_SIZE },
          },
        },
      },
      numbering: {
        config: [
          {
            reference: "ordered-list",
            levels: [
              this.numberingLevel(0, LevelFormat.DECIMAL, 720),
              this.numberingLevel(1, LevelFormat.LOWER_LETTER, 1440),
              this.numberingLevel(2, LevelFormat.LOWER_ROMAN, 2160),
              this.numberingLevel(3, LevelFormat.DECIMAL, 2880),
              this.numberingLevel(4, LevelFormat.LOWER_LETTER, 3600),
              this.numberingLevel(5, LevelFormat.LOWER_ROMAN, 4320),
            ],
          },
        ],
      },
      footnotes: ctx.footnotes,
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 }, // A4
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // ~1 inch
            },
          },
          children: blocks,
        },
      ],
    });
  }

  private static numberingLevel(
    level: number,
    format: (typeof LevelFormat)[keyof typeof LevelFormat],
    indent: number,
  ) {
    return {
      level,
      format,
      text: `%${level + 1}.`,
      alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: indent, hanging: 260 } } },
    };
  }

  private static appendBlocks(
    node: Node,
    ctx: ConverterContext,
    blocks: Block[],
    style: BlockStyle,
  ) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.trim() === "") return;
      blocks.push(
        this.paragraphFromRuns(
          [new TextRun(this.runOpts(text, style.runFormat ?? {}))],
          style,
        ),
      );
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    switch (tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        blocks.push(
          new Paragraph({
            heading: HEADING_MAP[tag],
            children: this.inlineRuns(el, ctx, style.runFormat ?? {}),
            spacing: { before: 240, after: 120 },
          }),
        );
        return;
      }
      case "p": {
        const paragraph = this.paragraphFromEl(el, ctx, style);
        if (paragraph) blocks.push(paragraph);
        return;
      }
      case "pre": {
        blocks.push(this.codeParagraph(el));
        return;
      }
      case "ul": {
        this.appendList(el, ctx, blocks, "bullet", 0);
        return;
      }
      case "ol": {
        this.appendList(el, ctx, blocks, "ordered", 0);
        return;
      }
      case "table": {
        const table = this.tableFromEl(el as HTMLTableElement, ctx);
        if (table) blocks.push(table);
        return;
      }
      case "blockquote": {
        const quoteStyle: BlockStyle = {
          runFormat: { ...(style.runFormat ?? {}), italics: true },
          indent: (style.indent ?? 0) + 460,
          borderLeft: { color: "3B82F6", size: 12 },
        };
        this.appendChildren(el, ctx, blocks, quoteStyle);
        return;
      }
      case "hr": {
        blocks.push(
          new Paragraph({
            children: [],
            border: {
              bottom: {
                style: BorderStyle.SINGLE,
                size: 8,
                color: "E5E7EB",
                space: 1,
              },
            },
            spacing: { before: 120, after: 120 },
          }),
        );
        return;
      }
      case "div": {
        if (el.classList.contains("mermaid-diagram")) {
          const image = this.imageParagraph(el, ctx);
          if (image) blocks.push(image);
          return;
        }
        if (el.classList.contains("markdown-alert")) {
          this.appendAlert(el, ctx, blocks);
          return;
        }
        this.appendChildren(el, ctx, blocks, style);
        return;
      }
      case "section": {
        if (el.classList.contains("footnotes")) {
          this.collectFootnotes(el, ctx);
          return;
        }
        this.appendChildren(el, ctx, blocks, style);
        return;
      }
      case "img": {
        const image = this.imageParagraph(el, ctx);
        if (image) blocks.push(image);
        return;
      }
      case "details": {
        for (const child of Array.from(el.childNodes)) {
          if (
            child.nodeType === Node.ELEMENT_NODE &&
            (child as HTMLElement).tagName.toLowerCase() === "summary"
          ) {
            blocks.push(
              new Paragraph({
                children: this.inlineRuns(child as HTMLElement, ctx, {
                  bold: true,
                }),
                spacing: { before: 80, after: 40 },
              }),
            );
          } else {
            this.appendBlocks(child, ctx, blocks, style);
          }
        }
        return;
      }
      default: {
        this.appendChildren(el, ctx, blocks, style);
      }
    }
  }

  private static appendChildren(
    el: HTMLElement,
    ctx: ConverterContext,
    blocks: Block[],
    style: BlockStyle,
  ) {
    for (const child of Array.from(el.childNodes)) {
      this.appendBlocks(child, ctx, blocks, style);
    }
  }

  private static paragraphFromEl(
    el: HTMLElement,
    ctx: ConverterContext,
    style: BlockStyle,
  ): Paragraph | null {
    const runs = this.inlineRuns(el, ctx, style.runFormat ?? {});
    if (runs.length === 0) return null;
    return this.paragraphFromRuns(runs, style);
  }

  private static paragraphFromRuns(
    runs: Inline[],
    style: BlockStyle,
  ): Paragraph {
    const opts: ConstructorParameters<typeof Paragraph>[0] = {
      children: runs,
      spacing: { before: 60, after: 60 },
      ...(style.indent ? { indent: { left: style.indent } } : {}),
      ...(style.borderLeft
        ? {
            border: {
              left: {
                style: BorderStyle.SINGLE,
                size: style.borderLeft.size,
                color: style.borderLeft.color,
                space: 8,
              },
            },
          }
        : {}),
      ...(style.shading
        ? {
            shading: {
              type: ShadingType.CLEAR,
              fill: style.shading,
              color: "auto",
            },
          }
        : {}),
    };
    return new Paragraph(opts);
  }

  private static inlineRuns(
    node: Node,
    ctx: ConverterContext,
    fmt: RunFormat,
  ): Inline[] {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.length === 0) return [];
      return [new TextRun(this.runOpts(text, fmt))];
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    switch (tag) {
      case "strong":
      case "b":
        return this.inlineChildren(el, ctx, { ...fmt, bold: true });
      case "em":
      case "i":
        return this.inlineChildren(el, ctx, { ...fmt, italics: true });
      case "del":
      case "s":
      case "strike":
        return this.inlineChildren(el, ctx, { ...fmt, strike: true });
      case "mark":
        return this.inlineChildren(el, ctx, { ...fmt, highlight: true });
      case "code": {
        const text = el.textContent ?? "";
        if (text.length === 0) return [];
        return [
          new TextRun({
            text,
            bold: fmt.bold,
            italics: fmt.italics,
            strike: fmt.strike,
            font: MONO_FONT,
            size: MONO_SIZE,
            shading: {
              type: ShadingType.CLEAR,
              fill: "EEF0F2",
              color: "auto",
            },
          }),
        ];
      }
      case "a": {
        const href = el.getAttribute("href") ?? "";
        const runs = this.inlineChildren(el, ctx, fmt);
        if (/^(https?:|mailto:)/i.test(href) && runs.length > 0) {
          return [new ExternalHyperlink({ link: href, children: runs })];
        }
        return runs;
      }
      case "sup": {
        if (el.querySelector("a[data-footnote-ref]")) {
          const match = /(\d+)/.exec(el.textContent ?? "");
          if (match) return [new FootnoteReferenceRun(parseInt(match[1], 10))];
        }
        return this.inlineChildren(el, ctx, fmt);
      }
      case "img": {
        const image = this.imageRun(el, ctx);
        return image ? [image] : [];
      }
      case "br":
        return [new TextRun({ text: "", break: 1 })];
      case "input": {
        if (el.getAttribute("type") === "checkbox") {
          return [
            new TextRun(
              this.runOpts(
                el.hasAttribute("checked") ? "\u2611" : "\u2610",
                fmt,
              ),
            ),
          ];
        }
        return [];
      }
      default:
        return this.inlineChildren(el, ctx, fmt);
    }
  }

  private static inlineChildren(
    el: HTMLElement,
    ctx: ConverterContext,
    fmt: RunFormat,
  ): Inline[] {
    const out: Inline[] = [];
    for (const child of Array.from(el.childNodes)) {
      out.push(...this.inlineRuns(child, ctx, fmt));
    }
    return out;
  }

  private static runOpts(
    text: string,
    fmt: RunFormat,
  ): ConstructorParameters<typeof TextRun>[0] {
    return {
      text,
      bold: fmt.bold,
      italics: fmt.italics,
      strike: fmt.strike,
      highlight: fmt.highlight ? HighlightColor.YELLOW : undefined,
    };
  }

  private static codeParagraph(pre: HTMLElement): Paragraph {
    const code = pre.querySelector("code");
    const text = (code ?? pre).textContent ?? "";
    const lines = text.split("\n");
    const children = lines.map((line, i) => {
      const opts: ConstructorParameters<typeof TextRun>[0] = {
        text: line,
        font: MONO_FONT,
        size: MONO_SIZE,
        color: CODE_TEXT,
        break: i > 0 ? 1 : 0,
      };
      return new TextRun(opts);
    });

    return new Paragraph({
      children,
      shading: {
        type: ShadingType.CLEAR,
        fill: CODE_FILL,
        color: "auto",
      },
      spacing: { before: 120, after: 120 },
      indent: { left: 240, right: 240 },
      border: {
        left: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE", space: 8 },
      },
    });
  }

  private static appendList(
    list: HTMLElement,
    ctx: ConverterContext,
    blocks: Block[],
    kind: "bullet" | "ordered",
    level: number,
  ) {
    for (const child of Array.from(list.children)) {
      if (child.tagName.toLowerCase() !== "li") continue;
      this.listItem(child as HTMLElement, ctx, blocks, kind, level);
    }
  }

  private static listItem(
    li: HTMLElement,
    ctx: ConverterContext,
    blocks: Block[],
    kind: "bullet" | "ordered",
    level: number,
  ) {
    const inlineParts: Node[] = [];
    const nestedLists: HTMLElement[] = [];

    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as HTMLElement).tagName.toLowerCase();
        if (tag === "ul" || tag === "ol") {
          nestedLists.push(child as HTMLElement);
          continue;
        }
      }
      inlineParts.push(child);
    }

    const runs: Inline[] = [];
    for (const part of inlineParts) {
      runs.push(...this.inlineRuns(part, ctx, {}));
    }

    const opts: ConstructorParameters<typeof Paragraph>[0] = {
      children: runs.length > 0 ? runs : [new TextRun("")],
      spacing: { before: 40, after: 40 },
      ...(kind === "bullet"
        ? { bullet: { level } }
        : { numbering: { reference: "ordered-list", level } }),
    };
    blocks.push(new Paragraph(opts));

    for (const nested of nestedLists) {
      const nestedKind =
        nested.tagName.toLowerCase() === "ol" ? "ordered" : "bullet";
      this.appendList(nested, ctx, blocks, nestedKind, level + 1);
    }
  }

  private static tableFromEl(
    table: HTMLTableElement,
    ctx: ConverterContext,
  ): Table | null {
    const headerRows = table.tHead ? Array.from(table.tHead.rows) : [];
    const bodyRows = table.tBodies.length
      ? Array.from(table.tBodies).flatMap((tb) => Array.from(tb.rows))
      : Array.from(table.rows).filter((row) => !headerRows.includes(row));

    const rows: TableRow[] = [];
    let columnCount = 0;

    for (const tr of [...headerRows, ...bodyRows]) {
      columnCount = Math.max(columnCount, tr.cells.length);
    }
    if (columnCount === 0) return null;

    for (const tr of [...headerRows, ...bodyRows]) {
      const isHeader = headerRows.includes(tr);
      const cells = Array.from(tr.cells).map((td) => {
        const align = (td.getAttribute("align") || "left").toLowerCase();
        const runs = this.inlineRuns(td, ctx, { bold: isHeader });
        const cellOpts: ConstructorParameters<typeof TableCell>[0] = {
          width: {
            size: 100 / columnCount,
            type: WidthType.PERCENTAGE,
          },
          verticalAlign: VerticalAlign.TOP,
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: runs.length > 0 ? runs : [new TextRun("")],
              alignment: this.alignmentFor(align),
              spacing: { before: 0, after: 0 },
            }),
          ],
          ...(isHeader
            ? {
                shading: {
                  type: ShadingType.CLEAR,
                  fill: "F0F2F5",
                  color: "auto",
                },
              }
            : {}),
        };
        return new TableCell(cellOpts);
      });

      rows.push(
        new TableRow({
          tableHeader: isHeader,
          children: cells,
        }),
      );
    }

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.AUTOFIT,
      rows,
    });
  }

  private static alignmentFor(
    align: string,
  ): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
    if (align === "center") return AlignmentType.CENTER;
    if (align === "right") return AlignmentType.RIGHT;
    return AlignmentType.LEFT;
  }

  private static appendAlert(
    alert: HTMLElement,
    ctx: ConverterContext,
    blocks: Block[],
  ) {
    const kind = alert.className.match(/markdown-alert-(\w+)/)?.[1] ?? "note";
    const color = ALERT_COLORS[kind] ?? ALERT_COLORS.note;
    const titleEl = alert.querySelector(".markdown-alert-title");

    if (titleEl) {
      const titleClone = titleEl.cloneNode(true) as HTMLElement;
      titleClone.querySelectorAll("svg").forEach((svg) => svg.remove());
      blocks.push(
        this.paragraphFromRuns(
          this.inlineRuns(titleClone, ctx, { bold: true }),
          {
            borderLeft: { color, size: 12 },
            shading: "F6F8FA",
          },
        ),
      );
    }

    for (const child of Array.from(alert.childNodes)) {
      const el = child as HTMLElement;
      if (el.classList?.contains("markdown-alert-title")) continue;
      const inner: Block[] = [];
      this.appendBlocks(child, ctx, inner, {
        borderLeft: { color, size: 12 },
        shading: "F6F8FA",
      });
      blocks.push(...inner);
    }
  }

  private static collectFootnotes(section: HTMLElement, ctx: ConverterContext) {
    const list = section.querySelector("ol");
    if (!list) return;

    const items = Array.from(list.children).filter(
      (el) => el.tagName.toLowerCase() === "li",
    );

    items.forEach((li, index) => {
      const clone = li.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll("a[data-footnote-backref]")
        .forEach((a) => a.remove());

      const paragraphs: Paragraph[] = [];
      let hasParagraph = false;

      for (const child of Array.from(clone.childNodes)) {
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          (child as HTMLElement).tagName.toLowerCase() === "p"
        ) {
          paragraphs.push(
            new Paragraph({
              children: this.inlineRuns(child, ctx, {}),
              spacing: { after: 80 },
            }),
          );
          hasParagraph = true;
        } else if (
          child.nodeType === Node.TEXT_NODE &&
          (child.textContent ?? "").trim() !== ""
        ) {
          paragraphs.push(
            new Paragraph({
              children: [new TextRun(child.textContent ?? "")],
            }),
          );
          hasParagraph = true;
        }
      }

      if (!hasParagraph) {
        const text = clone.textContent ?? "";
        if (text.trim() !== "") {
          paragraphs.push(new Paragraph({ children: [new TextRun(text)] }));
        }
      }

      if (paragraphs.length > 0) {
        ctx.footnotes[String(index + 1)] = { children: paragraphs };
      }
    });
  }

  private static imageParagraph(
    el: HTMLElement,
    ctx: ConverterContext,
  ): Paragraph | null {
    const image = this.imageRun(el, ctx);
    if (!image) return null;
    return new Paragraph({
      children: [image],
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120 },
    });
  }

  private static imageRun(
    el: HTMLElement,
    ctx: ConverterContext,
  ): ImageRun | null {
    const key = el.dataset.docxIndex;
    if (!key) return null;
    const asset = ctx.assets.get(key);
    if (!asset) return null;

    const { mime, bytes } = this.decodeDataUrl(asset.dataUrl);
    const type =
      mime === "image/jpeg" ? "jpg" : mime === "image/gif" ? "gif" : "png";

    return new ImageRun({
      type,
      data: bytes,
      transformation: { width: asset.width, height: asset.height },
    });
  }

  private static decodeDataUrl(dataUrl: string): {
    mime: string;
    bytes: Uint8Array;
  } {
    const comma = dataUrl.indexOf(",");
    const meta = dataUrl.slice(5, comma);
    const mime = meta.split(";")[0];
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { mime, bytes };
  }
}