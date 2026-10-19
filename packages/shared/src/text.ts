/**
 * The canonical form of a text's lines: CRLF becomes LF, trailing whitespace
 * is stripped from each line, and the text ends with exactly one newline.
 * Used for outputs; inputs go through the stricter `normaliseInput`.
 */
export function normaliseText(raw: string): string {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  while (lines.length > 0 && lines.at(-1) === "") {
    lines.pop();
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The canonical form of a query input, so a player is never rejected for a
 * character they cannot see. On top of `normaliseText`, within each line every
 * run of spaces, tabs and other blank characters (such as the no-break space
 * macOS types for Option+Space) becomes a single space, and leading blanks go.
 * Line breaks are kept: they are visible, and can be part of a level's format.
 *
 * This assumes no level gives meaning to repeated or leading spaces within a
 * line. A level that needs that will need its own rule here.
 */
export function normaliseInput(raw: string): string {
  return normaliseText(
    raw
      .replace(/\r\n?/g, "\n")
      .split("\n")
      // `\s` includes the no-break space and other Unicode blanks; `[^\S\n]`
      // is "any blank except a line break".
      .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
      .join("\n"),
  );
}

/** A plain decimal number: `90`, `-7.5`, `.5`, `1e-3`. Not `inf`, `nan` or `0x1F`. */
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** A whole number with no decimal point or exponent: `2000`, `-3`. */
const INTEGER = /^[+-]?\d+$/;

/** Absolute or relative, as in Kattis's `float_tolerance`. */
const FLOAT_TOLERANCE = 1e-6;

function tokensMatch(actual: string, expected: string): boolean {
  // Two whole numbers compare exactly: a relative tolerance on 1000000000
  // would otherwise accept anything within 1000 of it.
  if (INTEGER.test(actual) && INTEGER.test(expected)) {
    return BigInt(actual) === BigInt(expected);
  }
  if (NUMBER.test(actual) && NUMBER.test(expected)) {
    const a = Number(actual);
    const e = Number(expected);
    const diff = Math.abs(a - e);
    return diff <= FLOAT_TOLERANCE || diff <= FLOAT_TOLERANCE * Math.abs(e);
  }
  return actual === expected;
}

/**
 * How a submission's output is judged. Both texts are normalised, then
 * compared line by line and, within a line, token by token (split on
 * whitespace). Two numeric tokens match by value, within 1e-6 absolute or
 * relative, so `90`, `90.0` and `90.0000` are all the same answer; two whole
 * numbers must be equal. Any other token must match exactly.
 */
export function outputsMatch(actual: string, expected: string): boolean {
  const actualLines = normaliseText(actual).split("\n");
  const expectedLines = normaliseText(expected).split("\n");
  if (actualLines.length !== expectedLines.length) return false;
  return expectedLines.every((line, i) => {
    const actualTokens = actualLines[i]!.split(/\s+/).filter(Boolean);
    const expectedTokens = line.split(/\s+/).filter(Boolean);
    return (
      actualTokens.length === expectedTokens.length &&
      expectedTokens.every((token, j) => tokensMatch(actualTokens[j]!, token))
    );
  });
}
