import { randomBytes } from "node:crypto";
import {
  type Language,
  type Level,
  type Observation,
  outputsMatch,
  type SubmissionRequest,
  type SubmissionResult,
} from "@uat/shared";
import { strToU8, zipSync } from "fflate";
import { z } from "zod";
import type { LoadedLevel } from "./levels.ts";

/**
 * Judging a player's program with Judge0. This is the only way player code is
 * ever run: it is sent to Judge0's sandbox and never executed by the API.
 *
 * All of a level's hidden tests go in ONE Judge0 submission. One submission
 * per test recompiles the program every time, which measured 11 to 37 seconds
 * for 20 tests; compiling once and looping takes 3 to 7.
 *
 * How one submission runs every test:
 * - Judge0's "multi-file program" language takes a zip holding the player's
 *   source and two scripts of ours, `compile` and `run`.
 * - The test inputs are sent as the submission's stdin, not as files in the
 *   zip. Files would be readable while compiling, and compiler messages are
 *   shown to the player (`#include "tests/1.in"` would print a hidden input).
 * - `run` reads one test at a time from stdin, runs the program on it with its
 *   own time limit, and prints a marker line after each, so the outputs can be
 *   told apart afterwards.
 *
 * Expected outputs never leave the API: the comparison happens here.
 */

/** Judge0's id for "Multi-file program". */
const MULTI_FILE_LANGUAGE_ID = 89;

/** File name, build command and run command inside Judge0 1.13.1's image. */
const TOOLCHAINS: Record<Language, { file: string; compile: string; run: string }> = {
  python: {
    file: "main.py",
    // Not a real build, but it turns a syntax error into a free compile error
    // instead of a runtime error that costs a wrong submission. `limit=0`
    // prints the error itself without Python's own stack above it.
    compile: `/usr/local/python-3.8.1/bin/python3 -c '
import sys, traceback
try:
    compile(open("main.py", encoding="utf-8").read(), "main.py", "exec")
except SyntaxError:
    traceback.print_exc(limit=0)
    sys.exit(1)
'`,
    run: "/usr/local/python-3.8.1/bin/python3 main.py",
  },
  cpp: {
    file: "main.cpp",
    compile: "/usr/local/gcc-9.2.0/bin/g++ -std=c++17 -O2 -o main main.cpp",
    run: "env LD_LIBRARY_PATH=/usr/local/gcc-9.2.0/lib64 ./main",
  },
  go: {
    file: "main.go",
    compile:
      "GOCACHE=/tmp/.cache/go-build /usr/local/go-1.13.5/bin/go build -o main main.go",
    run: "./main",
  },
};

// Judge0's default ceilings for one submission. Asking for more is refused.
const MAX_CPU_SECONDS = 15;
const MAX_WALL_SECONDS = 20;
const MAX_MEMORY_KB = 512_000;

const POLL_INTERVAL_MS = 250;
const JUDGE_DEADLINE_MS = 60_000;
const MAX_COMPILE_MESSAGE_LENGTH = 4_000;

// `timeout` exits with 124 when it stops a program, or 137 if it had to kill it.
const TIMEOUT_EXIT_CODES = [124, 137];

/** What the program did on one test. */
type TestRun = { stdout: string; exitCode: number };

/**
 * The script Judge0 runs in place of the program. Its stdin holds, for each
 * test, a line with the input's size in bytes followed by the input itself.
 * It stops at the first test that crashes or times out: the verdict is the
 * first failing test, so nothing after that can matter.
 */
function runScript(runCommand: string, timeLimitSeconds: number, marker: string): string {
  return `#!/bin/bash
while read -r size; do
  head -c "$size" > input.txt
  timeout ${timeLimitSeconds} ${runCommand} < input.txt 2>/dev/null
  code=$?
  printf '\\n%s %s\\n' '${marker}' "$code"
  [ "$code" -eq 0 ] || break
done
`;
}

function packInputs(inputs: readonly string[]): string {
  return inputs.map((input) => `${Buffer.byteLength(input)}\n${input}`).join("");
}

/** Splits the script's output back into one entry per test that was run. */
function parseRuns(stdout: string, marker: string): TestRun[] {
  const runs: TestRun[] = [];
  const separator = `\n${marker} `;
  let position = 0;
  for (;;) {
    const markerAt = stdout.indexOf(separator, position);
    if (markerAt === -1) return runs;
    const lineEnd = stdout.indexOf("\n", markerAt + separator.length);
    if (lineEnd === -1) return runs;
    runs.push({
      stdout: stdout.slice(position, markerAt),
      exitCode: Number(stdout.slice(markerAt + separator.length, lineEnd)),
    });
    position = lineEnd + 1;
  }
}

/**
 * The verdict is decided by the first failing test, in the tests' fixed order.
 * `ranOutOfTime` says Judge0 stopped the whole script for taking too long,
 * which explains a test that never reported back.
 */
export function decideVerdict(
  tests: readonly Observation[],
  runs: readonly TestRun[],
  ranOutOfTime: boolean,
): SubmissionResult {
  for (const [index, test] of tests.entries()) {
    const revealed = { input: test.input, output: test.output };
    const run = runs[index];
    if (!run) {
      return { status: ranOutOfTime ? "time_limit" : "runtime_error", revealed };
    }
    if (TIMEOUT_EXIT_CODES.includes(run.exitCode)) {
      return { status: "time_limit", revealed };
    }
    if (run.exitCode !== 0) {
      return { status: "runtime_error", revealed };
    }
    if (!outputsMatch(run.stdout, test.output)) {
      return { status: "wrong_answer", revealed };
    }
  }
  return { status: "accepted" };
}

const toBase64 = (text: string | Uint8Array) => Buffer.from(text).toString("base64");
const fromBase64 = (text: string | null | undefined) =>
  text ? Buffer.from(text, "base64").toString("utf8") : "";

const judge0TokenSchema = z.object({ token: z.string() });
const judge0ResultSchema = z.object({
  status: z.object({ id: z.number(), description: z.string() }),
  stdout: z.string().nullish(),
  compile_output: z.string().nullish(),
  message: z.string().nullish(),
});

// Judge0 status ids. 1 and 2 mean it has not finished yet.
const STATUS_FINISHED_ABOVE = 2;
const STATUS_TIME_LIMIT = 5;
const STATUS_COMPILE_ERROR = 6;
const STATUS_INTERNAL_ERROR = 13;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createSubmitter(levels: readonly LoadedLevel[], judge0Url: string) {
  const byId = new Map(levels.map((loaded) => [loaded.level.id, loaded]));

  // Everything is sent and read base64-encoded: Judge0 refuses to return
  // output as plain text if it is not valid ASCII, which compiler errors are not.
  const judge0 = async (path: string, body?: unknown) => {
    const response = await fetch(`${judge0Url}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new Error(`Judge0 answered ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<unknown>;
  };

  return async (level: Level, { language, code }: SubmissionRequest): Promise<SubmissionResult> => {
    const loaded = byId.get(level.id);
    if (!loaded) throw new Error(`Level ${level.id} is not loaded`);

    const toolchain = TOOLCHAINS[language];
    const tests = loaded.secrets;
    const timeLimitSeconds = loaded.timeLimitMs / 1000;
    // Made up per submission so a program's own output is not mistaken for it.
    const marker = `@@${randomBytes(16).toString("hex")}`;

    const archive = zipSync({
      [toolchain.file]: strToU8(code),
      compile: strToU8(`#!/bin/bash\n${toolchain.compile}\n`),
      run: strToU8(runScript(toolchain.run, timeLimitSeconds, marker)),
    });

    const { token } = judge0TokenSchema.parse(
      await judge0("/submissions?base64_encoded=true", {
        language_id: MULTI_FILE_LANGUAGE_ID,
        additional_files: toBase64(archive),
        stdin: toBase64(packInputs(tests.map((test) => test.input))),
        cpu_time_limit: Math.min(MAX_CPU_SECONDS, tests.length * timeLimitSeconds + 2),
        wall_time_limit: Math.min(MAX_WALL_SECONDS, tests.length * timeLimitSeconds + 5),
        memory_limit: Math.min(MAX_MEMORY_KB, loaded.memoryLimitKb),
      }),
    );

    const deadline = Date.now() + JUDGE_DEADLINE_MS;
    for (;;) {
      const result = judge0ResultSchema.parse(
        await judge0(
          `/submissions/${token}?base64_encoded=true&fields=status,stdout,compile_output,message`,
        ),
      );

      if (result.status.id <= STATUS_FINISHED_ABOVE) {
        if (Date.now() > deadline) throw new Error("Judge0 did not finish in time");
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      if (result.status.id === STATUS_COMPILE_ERROR) {
        return {
          status: "compile_error",
          message: fromBase64(result.compile_output).trim().slice(0, MAX_COMPILE_MESSAGE_LENGTH),
        };
      }
      if (result.status.id >= STATUS_INTERNAL_ERROR) {
        throw new Error(
          `Judge0 failed: ${result.status.description}. ${fromBase64(result.message)}`,
        );
      }
      return decideVerdict(
        tests,
        parseRuns(fromBase64(result.stdout), marker),
        result.status.id === STATUS_TIME_LIMIT,
      );
    }
  };
}
