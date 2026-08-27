import type { Root, Blockquote, Paragraph, Text } from 'mdast';
import type { Transformer } from 'unified';
import { visit } from 'unist-util-visit';

// Maps GitHub alert types to Fumadocs Callout types.
const TYPES: Record<string, { type: string; title: string }> = {
  NOTE: { type: 'info', title: 'Note' },
  TIP: { type: 'idea', title: 'Tip' },
  IMPORTANT: { type: 'info', title: 'Important' },
  WARNING: { type: 'warn', title: 'Warning' },
  CAUTION: { type: 'error', title: 'Caution' },
};

const MARKER = /^\[!([A-Z]+)\]\s*\n?/;

/**
 * Converts GitHub alert blockquotes (`> [!NOTE]`) into Fumadocs `<Callout>`
 * elements. This is the syntax the sqlc docs content contract mandates for
 * admonitions; on GitHub the same syntax renders natively, so contributors'
 * previews stay faithful.
 */
export function remarkGithubAlerts(): Transformer<Root, Root> {
  return (tree) => {
    visit(tree, 'blockquote', (node: Blockquote, index, parent) => {
      if (parent === undefined || index === undefined) return;

      const first = node.children[0];
      if (first?.type !== 'paragraph') return;
      const firstText = (first as Paragraph).children[0];
      if (firstText?.type !== 'text') return;

      const match = MARKER.exec((firstText as Text).value);
      if (!match) return;
      const alert = TYPES[match[1]];
      if (!alert) return;

      // Strip the [!TYPE] marker, dropping the text node (and the leading
      // paragraph) if nothing remains of it.
      firstText.value = firstText.value.slice(match[0].length);
      if (firstText.value === '') {
        first.children.shift();
        // GitHub puts a hard break after the marker when the alert body
        // starts on the next line of the same paragraph.
        if (first.children[0]?.type === 'break') first.children.shift();
      }
      const children = first.children.length === 0 ? node.children.slice(1) : node.children;

      parent.children[index] = {
        type: 'mdxJsxFlowElement',
        name: 'Callout',
        attributes: [
          { type: 'mdxJsxAttribute', name: 'type', value: alert.type },
          { type: 'mdxJsxAttribute', name: 'title', value: alert.title },
        ],
        children,
        // mdast-util-mdx-jsx nodes are not part of the base mdast types.
      } as unknown as Blockquote;
    });
  };
}
