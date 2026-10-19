import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";
import { parseTex, type TexNode } from "../lib/tex";

function Node({ node }: { node: TexNode }) {
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
      return <strong>{children}</strong>;
    }
  }
}

/** Renders a level statement (`input.tex` or `output.tex`) as paragraphs. */
export function Tex({ source, className }: { source: string; className?: string }) {
  const paragraphs = useMemo(() => parseTex(source), [source]);
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
