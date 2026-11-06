import katex from "katex";
import "katex/dist/katex.min.css";
import { createContext, useContext, useMemo } from "react";
import { parseTex, type TexNode } from "../lib/tex";

/**
 * What a `\guide{...}` link does: opens the guide at its pattern for reading a
 * list. Provided by the level screen; without it the words are plain text.
 */
export const GuideLinkContext = createContext<(() => void) | null>(null);

/**
 * Maths here always sits inside a sentence, so the display-style forms, which
 * stand twice the height of the text around them, are set in their inline
 * size instead: `\dfrac` as `\frac`, `\dbinom` as `\binom`.
 */
const INLINE_SIZED = {
  "\\dfrac": "\\frac",
  "\\dbinom": "\\binom",
  "\\displaystyle": "\\textstyle",
};

function Node({ node }: { node: TexNode }) {
  const openGuide = useContext(GuideLinkContext);
  switch (node.type) {
    case "text":
      return node.text;
    case "math":
      // KaTeX returns markup it has escaped itself, and the source is our own
      // level statement, so injecting it is safe.
      return (
        <span
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(node.source, {
              throwOnError: false,
              errorColor: "var(--color-oxblood)",
              macros: INLINE_SIZED,
            }),
          }}
        />
      );
    case "command": {
      const children = node.children.map((child, index) => (
        <Node key={index} node={child} />
      ));
      if (node.name === "texttt") return <code className="font-mono">{children}</code>;
      if (node.name === "emph") return <em>{children}</em>;
      if (node.name === "guide") {
        if (!openGuide) return children;
        return (
          <button
            type="button"
            onClick={openGuide}
            className="cursor-pointer text-walnut underline decoration-stone underline-offset-4 outline-offset-2 outline-walnut hover:decoration-walnut focus-visible:outline-2"
          >
            {children}
          </button>
        );
      }
      return <strong>{children}</strong>;
    }
  }
}

/**
 * Renders a level statement (`input.tex` or `output.tex`) as paragraphs, or,
 * with `inline`, a single sentence (a level's solution) inside a parent's
 * paragraph.
 */
export function Tex({ source, className, inline }: { source: string; className?: string; inline?: boolean }) {
  const paragraphs = useMemo(() => parseTex(source), [source]);
  if (inline) {
    return paragraphs.flat().map((node, index) => <Node key={index} node={node} />);
  }
  return (
    <div className={className}>
      {paragraphs.map((nodes, index) => (
        <p key={index} className="mt-2 leading-relaxed">
          {nodes.map((node, nodeIndex) => (
            <Node key={nodeIndex} node={node} />
          ))}
        </p>
      ))}
    </div>
  );
}
