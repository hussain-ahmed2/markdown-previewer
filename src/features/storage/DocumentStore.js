import { els } from '../../utils/dom.js';

/**
 * Handles persistence of the Markdown document.
 * Manages loading and saving content to the browser's LocalStorage.
 */
export class DocumentStore {
  /**
   * Attempts to load the saved Markdown content from LocalStorage.
   * If found, it populates the editor.
   * @returns {boolean} True if a saved document was found, otherwise false.
   */
  static load() {
    const saved = localStorage.getItem('markdown-content');
    if (saved) {
      els.editor.value = saved;
      return true;
    }
    return false;
  }

  /**
   * Saves the current content of the editor to LocalStorage.
   * This is typically called on every input event (debounced).
   */
  static save() {
    localStorage.setItem('markdown-content', els.editor.value);
  }

  /**
   * Loads the default comprehensive example Markdown into the editor
   * and saves it to LocalStorage.
   */
  static loadExample() {
    const example = `# Markdown Previewer — Complete Example
This document demonstrates **all supported Markdown features** in this previewer.

***

## Headings

# Heading 1 (H1)
## Heading 2 (H2)
### Heading 3 (H3)
#### Heading 4 (H4)
##### Heading 5 (H5)
###### Heading 6 (H6)

***

## Text Formatting

**Bold text** using double asterisks
*Italic text* using single asterisk
~~Strikethrough~~ using double tildes
\`Inline code\` using backticks
***Bold and italic*** combined
<mark>Highlighted text</mark> (using \`<mark>\`)

***

## Lists

### Unordered List
* Item 1
* Item 2
  * Nested item A
  * Nested item B
    * Deeply nested item

### Ordered List
1. First step
2. Second step
   1. Sub-step 2.1
   2. Sub-step 2.2
3. Third step

### Task List
- [x] Completed task
- [ ] Incomplete task
- [ ] Another incomplete task

***

## Blockquotes

> This is a standard blockquote.
> It can span multiple lines.
>
> > Nested blockquotes are also supported!
> > They look like this.

***

## Code Blocks (Syntax Highlighting)

### JavaScript
\`\`\`javascript
// A simple function
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

const cart = [{ price: 10 }, { price: 25 }];
console.log(calculateTotal(cart)); // Output: 35
\`\`\`

### Python
\`\`\`python
def fibonacci(n):
    if n <= 1:
        return n
    else:
        return(fibonacci(n-1) + fibonacci(n-2))

print(fibonacci(5))
\`\`\`

### CSS
\`\`\`css
.button {
  background-color: #3b82f6;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.25rem;
}
.button:hover {
  background-color: #2563eb;
}
\`\`\`

***

## Tables

| Feature | Support | Syntax |
| :--- | :---: | ---: |
| Tables | ✅ | \`\| Col \| Col \|\` |
| Code | ✅ | \` \`\`\` \` |
| Mermaid | ✅ | \` \`\`\`mermaid \` |
| Math | ✅ | \` $$\` |

*Notice the alignment: Left, Center, and Right aligned columns.*

***

## Links and Images

[Link to GitHub](https://github.com)
[Link with title](https://google.com "Go to Google")

![Placeholder Image](https://via.placeholder.com/600x200 "This is a placeholder image")

***

## Horizontal Rules

Three different ways to draw a line:

---

***

___

***

## HTML Elements

You can embed raw HTML if needed:
<div style="padding: 10px; background: #e0f2fe; border-left: 4px solid #0284c7; color: #0369a1; border-radius: 4px; margin-bottom: 20px;">
  <strong>Info Box:</strong> This is a custom HTML element rendered directly inside the Markdown.
</div>

<details>
  <summary>Click to expand</summary>
  <p>This content was hidden inside an HTML details tag!</p>
</details>

***

## Description Lists

Term 1
: Definition of term 1

Term 2
: Definition of term 2
: Another definition of term 2

***

## Mermaid Diagrams

Our previewer natively supports rendering Mermaid flowcharts, sequence diagrams, and more.

### Flowchart
\`\`\`mermaid
graph TD
    A[Hard work] --> B(Success)
    A --> C(Failure)
    B --> D{Keep going?}
    C --> D
    D -->|Yes| A
    D -->|No| E[Rest]
\`\`\`

### Sequence Diagram
\`\`\`mermaid
sequenceDiagram
    Alice->>+John: Hello John, how are you?
    Alice->>+John: John, can you hear me?
    John-->>-Alice: Hi Alice, I can hear you!
    John-->>-Alice: I feel great!
\`\`\``;
    els.editor.value = example;
    this.save();
  }
}
