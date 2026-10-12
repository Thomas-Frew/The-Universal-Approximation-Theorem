/**
 * The one canonical form for machine input and output text: CRLF becomes LF,
 * trailing whitespace is stripped from each line, and the text ends with
 * exactly one newline.
 *
 * Query input is put in this form before it is validated or cached, so a
 * player is never rejected for an invisible character.
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
 * How a submission's output is judged: trailing whitespace on each line and
 * trailing blank lines are ignored, and everything else must match exactly.
 */
export function outputsMatch(actual: string, expected: string): boolean {
  return normaliseText(actual) === normaliseText(expected);
}
