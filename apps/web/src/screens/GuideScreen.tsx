import { type Language, PENALTY_COSTS } from "@uat/shared";
import { type ReactNode, useState } from "react";
import { Label } from "../components/Label";
import { LANGUAGE_NAMES } from "../lib/starterCode";

type GuideScreenProps = { onBack: () => void };

const buttonBase =
  "cursor-pointer rounded-md border px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut transition-colors focus-visible:outline-2";

/**
 * The worked example, as an Input and Output box would describe it. Every
 * language solves this same problem, so they can be compared line by line.
 */
const EXAMPLE_INPUT = `3
2 3
10 -4
7 7
`;
const EXAMPLE_OUTPUT = `5
6
14
`;

/** The example solved in each language. They must run on the judge's versions. */
const EXAMPLE: Record<Language, string> = {
  python: `n = int(input())
for _ in range(n):
    a, b = map(int, input().split())
    print(a + b)
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    for (int i = 0; i < n; i++) {
        long long a, b;
        cin >> a >> b;
        cout << a + b << '\\n';
    }
    return 0;
}
`,
  go: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	in := bufio.NewReader(os.Stdin)
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()

	var n int
	fmt.Fscan(in, &n)
	for i := 0; i < n; i++ {
		var a, b int64
		fmt.Fscan(in, &a, &b)
		fmt.Fprintln(out, a+b)
	}
}
`,
};

/** What the judge's Judge0 image runs, and the newer features most likely to be missed. */
const VERSIONS: { language: Language; release: string; missing: string }[] = [
  {
    language: "python",
    release: "Python 3.8",
    missing: "No `match` (3.10), no `list[int]` in type hints (3.9), no `math.lcm` (3.9).",
  },
  {
    language: "cpp",
    release: "C++17, GCC 9",
    missing: "No C++20: no ranges, `std::format` or `<=>`. `bits/stdc++.h` works.",
  },
  {
    language: "go",
    release: "Go 1.13",
    missing: "No generics (1.18), no built-in `min` and `max` (1.21), no `slices` or `maps` packages.",
  },
];

/** Smaller patterns, each a few lines, for the other shapes input comes in. */
const PATTERNS: { title: string; note?: string; code: Record<Language, string> }[] = [
  {
    title: "Several numbers on one line",
    code: {
      python: `nums = list(map(int, input().split()))`,
      cpp: `int k;
cin >> k;
vector<long long> nums(k);
for (auto &x : nums) cin >> x;`,
      go: `var k int
fmt.Fscan(in, &k)
nums := make([]int64, k)
for i := range nums {
	fmt.Fscan(in, &nums[i])
}`,
    },
    note: "Python reads the whole line, however many numbers it holds. C++ and Go read a count first.",
  },
  {
    title: "A whole line of text, spaces included",
    code: {
      python: `line = input()`,
      cpp: `string line;
getline(cin, line);`,
      go: `line, _ := in.ReadString('\\n')
line = strings.TrimRight(line, "\\n")`,
    },
    note: "After reading a number, the rest of its line (at least the newline) is still waiting. In C++ call `cin.ignore()` once before the first `getline`; in Go, call `in.ReadString('\\n')` once and discard it. In Go, also add \"strings\" to the imports.",
  },
  {
    title: "Printing a decimal",
    code: {
      python: `print(f"{x:.6f}")`,
      cpp: `cout << fixed << setprecision(6) << x << '\\n';`,
      go: `fmt.Fprintf(out, "%.6f\\n", x)`,
    },
    note: "Six places is plenty: decimals are compared to within 0.000001, so 90, 90.0 and 90.000000 are all the same answer.",
  },
];

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-stone bg-paper p-4 font-mono text-sm leading-relaxed">
      {children.trimEnd()}
    </pre>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-stone bg-vellum p-6">
      <h2 className="text-2xl italic">{title}</h2>
      <div className="mt-4 flex flex-col gap-4 leading-relaxed">{children}</div>
    </section>
  );
}

/** One fact a player can rely on, as a short bold lead and its explanation. */
function Rule({ lead, children }: { lead: string; children: ReactNode }) {
  return (
    <p>
      <span className="font-bold">{lead}</span> {children}
    </p>
  );
}

/**
 * The guide: how to read input and write output in each language, and what
 * every machine can be relied on to do. Public knowledge only: nothing here
 * hints at any machine's logic.
 */
export function GuideScreen({ onBack }: GuideScreenProps) {
  const [language, setLanguage] = useState<Language>("cpp");

  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:guide]">
      {/* The same header grid as the feedback and stats pages. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 border-b border-stone pb-4">
        <div className="col-start-1 row-start-1">
          <Label>The Universal Approximation Theorem</Label>
        </div>
        <h1 className="col-span-2 row-start-2 text-4xl font-bold lg:col-span-1">Guide</h1>
        <div className="col-start-2 row-start-1 flex items-center gap-3 self-start lg:row-span-2 lg:self-end">
          <button type="button" onClick={onBack} className={`${buttonBase} border-stone bg-paper hover:bg-linen`}>
            Back
          </button>
        </div>
      </header>

      <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-6">
        <Section title="Key Information">
          <div className="flex flex-col gap-3">
            <Rule lead="Aim:">Reconstruct how the machine maps its inputs to outputs, based on the machine's name, input/output ranges and observations.</Rule>
            <Rule lead="Deterministic:">The same input always gives the same output.</Rule>
            <Rule lead="Input:">The only possible inputs are described in the Input box.</Rule>
            <Rule lead="Query:">
              Samples are free. A new query incurs {PENALTY_COSTS.query} penalty.
            </Rule>
            <Rule lead="Submit:">
              A wrong answer, crash or timeout incurs {PENALTY_COSTS.wrongSubmission} penalty and reveals the first
              failed test. A compile error incurs no penalty. Tests run in a fixed order.
            </Rule>
            <Rule lead="Run:">Free. Checks your code against your observations and shows the differences.</Rule>
            <Rule lead="Output:">
              Compared word by word, ignoring trailing spaces and blank lines. Decimals match within 0.000001,
              everything else exactly, capitals included.
            </Rule>
            <Rule lead="Solving:">Freezes your penalty. Play on as much as you like.</Rule>
            <Rule lead="Time and Space:">Complexity is not an issue. You never need to optimise.</Rule>
          </div>
        </Section>

        <Section title="Language Versions">
          <p>The judge runs fixed, older versions. Code that uses newer features will not compile.</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3">
            {VERSIONS.map((version) => (
              <div key={version.language} className="contents">
                <dt className="font-bold">{version.release}</dt>
                <dd>{renderNote(version.missing)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Reading Input">
          <p>
            Your program reads from standard input and writes to standard output, nothing else: no files, no
            prompts like <code className="font-mono text-sm">input("Enter n: ")</code>.
          </p>

          <div role="tablist" aria-label="Language" className="flex gap-2">
            {(Object.keys(LANGUAGE_NAMES) as Language[]).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={language === option}
                onClick={() => setLanguage(option)}
                className={`${buttonBase} ${
                  language === option ? "border-walnut bg-walnut text-paper" : "border-stone bg-paper hover:bg-linen"
                }`}
              >
                {LANGUAGE_NAMES[option]}
              </button>
            ))}
          </div>

          <h3 className="mt-2 text-xl italic">A Worked Example</h3>
          <p>
            Suppose the Input box says: <em>a line with an integer n, then n lines, each with two integers a and
            b</em>. The Output box says: <em>for each pair, a line with one integer</em>. And the machine turns
            out to add them.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Input</Label>
              <Code>{EXAMPLE_INPUT}</Code>
            </div>
            <div>
              <Label>Output</Label>
              <Code>{EXAMPLE_OUTPUT}</Code>
            </div>
          </div>
          <Code>{EXAMPLE[language]}</Code>

          {PATTERNS.map((pattern) => (
            <div key={pattern.title} className="flex flex-col gap-2">
              <h3 className="mt-2 text-xl italic">{pattern.title}</h3>
              <Code>{pattern.code[language]}</Code>
              {pattern.note && <p className="text-sm text-taupe">{renderNote(pattern.note)}</p>}
            </div>
          ))}
        </Section>
      </div>
    </main>
  );
}

/** Notes mark code with backticks; shown in the code font. */
function renderNote(note: string): ReactNode[] {
  return note.split(/(`[^`]+`)/).map((part, index) =>
    part.startsWith("`") ? (
      <code key={index} className="font-mono text-ink">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}
