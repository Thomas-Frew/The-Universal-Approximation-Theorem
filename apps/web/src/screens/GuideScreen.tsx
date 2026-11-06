import { type Language, PENALTY_COSTS } from "@uat/shared";
import { type ReactNode, useEffect, useState } from "react";
import { HeaderTools, NavButton } from "../components/HeaderTools";
import { Label } from "../components/Label";
import { LANGUAGE_NAMES } from "../lib/starterCode";

type GuideScreenProps = {
  onBack: () => void;
  /** Opens the Save Key and Alias page, whose Back returns here. */
  onOpenSave: () => void;
  /** A pattern to scroll to on arrival, by its `id` (the `\guide{}` links in input boxes use `lists`). */
  focus?: string;
};

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
  java: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        PrintWriter out = new PrintWriter(System.out);

        int n = Integer.parseInt(in.readLine().trim());
        for (int i = 0; i < n; i++) {
            StringTokenizer st = new StringTokenizer(in.readLine());
            long a = Long.parseLong(st.nextToken());
            long b = Long.parseLong(st.nextToken());
            out.println(a + b);
        }
        out.flush();
    }
}
`,
};

/**
 * What the judge runs: the toolchains in `infra/judge0/Dockerfile`, called by
 * `apps/api/src/judge.ts`.
 */
const VERSIONS: Record<Language, string> = {
  python: "Python 3.10",
  cpp: "C++23, GCC 15",
  go: "Go 1.23",
  java: "Java 25 (the class must be called Main)",
};

/**
 * Smaller patterns, each a few lines, for the other shapes input comes in.
 * `note` is shown for every language; `languageNotes` only under its own tab.
 */
const PATTERNS: {
  id?: string;
  title: string;
  note?: string;
  languageNotes?: Partial<Record<Language, string>>;
  code: Record<Language, string>;
}[] = [
  {
    // The target of the guide links in input boxes that hold a list.
    id: "lists",
    title: "A list of numbers, however long",
    code: {
      python: `nums = list(map(int, input().split()))`,
      cpp: `vector<long long> nums;
long long x;
while (cin >> x) nums.push_back(x);`,
      go: `line, _ := in.ReadString('\\n')
var nums []int
for _, field := range strings.Fields(line) {
	x, _ := strconv.Atoi(field)
	nums = append(nums, x)
}`,
      java: `StringTokenizer st = new StringTokenizer(in.readLine());
List<Long> nums = new ArrayList<>();
while (st.hasMoreTokens()) nums.add(Long.parseLong(st.nextToken()));`,
    },
    note: "For when the Input is a list of unbounded length.",
    languageNotes: {
      python: "This reads the whole line and splits it.",
      cpp: "This reads until the input runs out.",
      go: "This reads the whole line and splits it. Add \"strings\" and \"strconv\" to the imports.",
      java: "This reads the whole line and splits it.",
    },
  },
  {
    title: "Printing a decimal",
    code: {
      python: `print(f"{x:.6f}")`,
      cpp: `cout << fixed << setprecision(6) << x << '\\n';`,
      go: `fmt.Fprintf(out, "%.6f\\n", x)`,
      java: `out.printf("%.6f%n", x);`,
    },
    note: "Six places is plenty: decimals are compared to ±0.000001, so 90, 90.0 and 90.000000 are all the same.",
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
export function GuideScreen({ onBack, onOpenSave, focus }: GuideScreenProps) {
  const [language, setLanguage] = useState<Language>("cpp");

  // Opened from a link to one pattern: start there rather than at the top.
  useEffect(() => {
    if (focus) document.getElementById(focus)?.scrollIntoView({ block: "start" });
  }, [focus]);

  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:guide]">
      {/* The same header grid as the feedback and stats pages. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 border-b border-stone pb-4">
        <div className="col-span-2 row-start-2 lg:col-span-1 lg:row-start-1">
          <Label>The Universal Approximation Theorem</Label>
        </div>
        <h1 className="col-span-2 row-start-3 text-4xl font-bold lg:col-span-1 lg:row-start-2">Guide</h1>
        <div className="col-span-2 row-start-1 mb-4 flex items-center gap-3 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:mb-0 lg:self-end">
          <HeaderTools />
          <NavButton onClick={onBack}>Back</NavButton>
        </div>
      </header>

      <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-6">
        <Section title="Key Information">
          <div className="flex flex-col gap-3">
            <Rule lead="Aim:">Reconstruct how the machine maps its inputs to outputs, based on the machine's name, input/output ranges and observations. Solve as many problems as possible with minimum penalty</Rule>
            <Rule lead="Deterministic:">The same input always gives the same output.</Rule>
            <Rule lead="Input:">The only possible inputs are described in the Input box.</Rule>
            <Rule lead="Query:">
              Samples are free. A new query incurs {PENALTY_COSTS.query} penalty.
            </Rule>
            <Rule lead="Submit:">
              A wrong answer, crash or timeout incurs {PENALTY_COSTS.wrongSubmission} penalty and reveals the first
              failed test. A compile error incurs no penalty. Tests run in a fixed order.
            </Rule>
            <Rule lead="Run:">Checks your code against your observations and shows the differences for free.</Rule>
            <Rule lead="Output:">
              Compared word by word, ignoring trailing spaces and blank lines. Decimals match ±0.000001,
              everything else exactly, capitals included.
            </Rule>
            <Rule lead="Solving:">Freezes your penalty. Play on as much as you like.</Rule>
            <Rule lead="Time and Space:">Complexity is not an issue. You never need to optimise.</Rule>
          </div>
        </Section>

        <Section title="Save Key and Alias">
          <p>
            Each user has a unique save key, which they can use to persist their progress. Loading it, here or on
            another device, brings back your progress and submitted code. Anyone with the key can play as you, so
            keep it to yourself.
          </p>
          <p>
            Your alias is the name other players see on the scoreboard, under Stats. You start with a made-up one,
            and can change it on the same page or with Rename beside your row on the scoreboard. Aliases are unique,
            and belong to your save key, so loading the key brings yours back too.
          </p>
          <div>
            <button
              type="button"
              onClick={onOpenSave}
              className={`${buttonBase} border-walnut bg-walnut text-paper hover:bg-ink`}
            >
              Open Save Key and Alias
            </button>
          </div>
          <p className="text-sm text-taupe">Also under Settings &rarr; Save key and alias.</p>
        </Section>

        <Section title="Language Versions">
          <p>The judge runs these versions. Features from anything newer will not compile.</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2">
            {(Object.keys(LANGUAGE_NAMES) as Language[]).map((language) => (
              <div key={language} className="contents">
                <dt className="font-bold">{LANGUAGE_NAMES[language]}:</dt>
                <dd>{VERSIONS[language]}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Reading Input">
          <p>
            Your program reads from standard input and writes to standard output, nothing else: no files, no
            prompts like <code className="font-mono text-sm">input("Enter n: ")</code>.
          </p>

          <div role="tablist" aria-label="Language" className="flex flex-wrap gap-2">
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
            <div key={pattern.title} id={pattern.id} className="flex scroll-mt-6 flex-col gap-2">
              <h3 className="mt-2 text-xl italic">{pattern.title}</h3>
              <Code>{pattern.code[language]}</Code>
              {(pattern.note || pattern.languageNotes?.[language]) && (
                <p className="text-sm text-taupe">
                  {renderNote([pattern.note, pattern.languageNotes?.[language]].filter(Boolean).join(" "))}
                </p>
              )}
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
