/**
 * Parser for the small LaTeX subset level statements use: paragraphs separated
 * by blank lines, `$...$` maths, and `\texttt`, `\emph`, `\textbf`. Anything
 * else is kept as plain text, so a mistake in a statement shows up on the page.
 */

const COMMANDS = ["texttt", "emph", "textbf"] as const;
export type TexCommand = (typeof COMMANDS)[number];

export type TexNode =
  | { type: "text"; text: string }
  | { type: "math"; source: string }
  | { type: "command"; name: TexCommand; children: TexNode[] };

/** Characters that LaTeX needs a backslash in front of: `\$`, `\%`, `\_`, ... */
const ESCAPABLE = "$%&#_{}";

/**
 * Reads inline nodes from `source[start]` onwards. Inside a command's braces
 * (`untilBrace`) it stops at the matching `}`. Returns the nodes and the
 * position just after the last character it consumed.
 */
function parseInline(
  source: string,
  start: number,
  untilBrace: boolean,
): { nodes: TexNode[]; end: number } {
  const nodes: TexNode[] = [];
  let text = "";
  const flushText = () => {
    if (text) nodes.push({ type: "text", text });
    text = "";
  };

  let i = start;
  while (i < source.length) {
    const char = source.charAt(i);

    if (untilBrace && char === "}") {
      flushText();
      return { nodes, end: i + 1 };
    }

    if (char === "$") {
      const close = source.indexOf("$", i + 1);
      if (close !== -1) {
        flushText();
        nodes.push({ type: "math", source: source.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    if (char === "\\") {
      const next = source.charAt(i + 1);
      if (next && ESCAPABLE.includes(next)) {
        text += next;
        i += 2;
        continue;
      }
      const name = COMMANDS.find((command) => source.startsWith(`${command}{`, i + 1));
      if (name) {
        flushText();
        // Recursion: the braces can hold maths or another command.
        const inner = parseInline(source, i + name.length + 2, true);
        nodes.push({ type: "command", name, children: inner.nodes });
        i = inner.end;
        continue;
      }
    }

    text += char;
    i += 1;
  }

  flushText();
  return { nodes, end: i };
}

/** One array of nodes per paragraph. */
export function parseTex(source: string): TexNode[][] {
  return source
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    // A single newline inside a paragraph is just a space, as in LaTeX.
    .map((paragraph) => parseInline(paragraph.replace(/\s*\n\s*/g, " "), 0, false).nodes);
}
