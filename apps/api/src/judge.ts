import { randomBytes } from "node:crypto";
import {
  type Language,
  type Level,
  MAX_RUN_OUTPUT_LENGTH,
  type Observation,
  outputsMatch,
  type RunOutcome,
  type RunResult,
  type RuntimeError,
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

/**
 * File name, build command and run command inside the judge image: Judge0
 * 1.13.1 plus the newer toolchains in `infra/judge0/Dockerfile` (Python 3.10,
 * GCC 15 for C++23, Go 1.23, Java 25). Judge0's own older ones are still in
 * the image but no longer used.
 */
const TOOLCHAINS: Record<Language, { file: string; compile: string; run: string }> = {
  python: {
    file: "main.py",
    // Not a real build, but it turns a syntax error into a free compile error
    // instead of a runtime error that costs a wrong submission. `limit=0`
    // prints the error itself without Python's own stack above it.
    compile: `/usr/local/python-3.10.22/bin/python3 -c '
import sys, traceback
try:
    compile(open("main.py", encoding="utf-8").read(), "main.py", "exec")
except SyntaxError:
    traceback.print_exc(limit=0)
    sys.exit(1)
'`,
    run: "/usr/local/python-3.10.22/bin/python3 main.py",
  },
  cpp: {
    file: "main.cpp",
    compile: "/usr/local/gcc-15.3.0/bin/g++ -std=c++23 -O2 -o main main.cpp",
    // The program links to GCC 15's own C++ library, not the system's older one.
    run: "env LD_LIBRARY_PATH=/usr/local/gcc-15.3.0/lib64 ./main",
  },
  go: {
    file: "main.go",
    // The sandbox has no home folder and no network: Go keeps its files in
    // /tmp, never tries to fetch another Go version, and builds a fully
    // self-contained program. Its build cache starts as links to the standard
    // library the image compiled in advance (read-only in the sandbox), so
    // only the player's own package is compiled. These settings must match
    // the ones that cache was built with (infra/judge0/Dockerfile).
    compile:
      "mkdir -p /tmp/.cache && cp -rs /usr/local/go-1.23.12-cache /tmp/.cache/go-build && HOME=/tmp GOPATH=/tmp/go GOCACHE=/tmp/.cache/go-build GOTOOLCHAIN=local CGO_ENABLED=0 /usr/local/go-1.23.12/bin/go build -o main main.go",
    run: "./main",
  },
  java: {
    // The file must be Main.java, so the player's class must be `Main`
    // (javac says so, as a free compile error, if it is not).
    file: "Main.java",
    // Both the compiler and the program are JVMs: the serial garbage
    // collector starts no extra threads, and -XX:-UsePerfData stops each
    // writing a stats file to /tmp. javac stops at the quick first tier of the
    // JIT, since it runs for a second, not long enough for the slower tiers to
    // pay off.
    compile:
      "/usr/local/jdk-25.0.5/bin/javac -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1 -J-XX:-UsePerfData -encoding UTF-8 -d . Main.java",
    // Java's default stack (1 MB) overflows on recursion a few thousand deep;
    // -Xss gives the program's main thread 64 MB.
    run: "/usr/local/jdk-25.0.5/bin/java -XX:+UseSerialGC -XX:-UsePerfData -Xss64m Main",
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

/**
 * What the program did on one test. `ms` is its wall time, as the run script
 * measured it. `stderr` is kept on a Run only; on a submission it is always "".
 */
type TestRun = { stdout: string; exitCode: number; ms: number; stderr: string };

/** How much of a crashing program's standard error a Run keeps, in bytes. */
const MAX_STDERR_BYTES = 4_000;

/**
 * The script Judge0 runs in place of the program. Its stdin holds, for each
 * test, a line with the input's size in bytes followed by the input itself.
 *
 * When judging a submission it stops at the first test that crashes or times
 * out: the verdict is the first failing test, so nothing after that can
 * matter, and the program's standard error is thrown away, since on hidden
 * tests it could carry them out. A Run reports on every observation, so it
 * keeps going, and keeps the start of each one's standard error (so a crash
 * can say where it happened), base64 on the marker line, where nothing the
 * program prints can be mistaken for it.
 *
 * Either way each test is timed, in milliseconds from just before the program
 * starts to just after it ends (`date +%s%N` is nanoseconds), and the time
 * goes on the marker line: "<exit code> <ms>", then on a Run " <stderr>".
 */
function runScript(runCommand: string, timeLimitSeconds: number, marker: string, isSubmission: boolean): string {
  return isSubmission
    ? `#!/bin/bash
while read -r size; do
  head -c "$size" > input.txt
  start=$(date +%s%N)
  timeout ${timeLimitSeconds} ${runCommand} < input.txt 2>/dev/null
  code=$?
  end=$(date +%s%N)
  printf '\\n%s %s %s\\n' '${marker}' "$code" "$(( (end - start) / 1000000 ))"
  [ "$code" -eq 0 ] || break
done
`
    : `#!/bin/bash
while read -r size; do
  head -c "$size" > input.txt
  start=$(date +%s%N)
  timeout ${timeLimitSeconds} ${runCommand} < input.txt 2>stderr.txt
  code=$?
  end=$(date +%s%N)
  printf '\\n%s %s %s %s\\n' '${marker}' "$code" "$(( (end - start) / 1000000 ))" "$(head -c ${MAX_STDERR_BYTES} stderr.txt | base64 -w0)"
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
    // "<exit code> <ms>", and on a Run then " <standard error in base64>".
    const [code = "", ms = "", stderr = ""] = stdout.slice(markerAt + separator.length, lineEnd).split(" ");
    runs.push({
      stdout: stdout.slice(position, markerAt),
      exitCode: Number(code),
      ms: Number(ms),
      stderr: Buffer.from(stderr, "base64").toString("utf8"),
    });
    position = lineEnd + 1;
  }
}

type TestVerdict = RunOutcome["verdict"];

/**
 * How the program did on one test. `ranOutOfTime` says Judge0 stopped the
 * whole script for taking too long, which explains a test that never reported back.
 */
function judgeTest(
  run: TestRun | undefined,
  expected: string,
  ranOutOfTime: boolean,
): TestVerdict {
  if (!run) return ranOutOfTime ? "time_limit" : "runtime_error";
  if (TIMEOUT_EXIT_CODES.includes(run.exitCode)) return "time_limit";
  if (run.exitCode !== 0) return "runtime_error";
  return outputsMatch(run.stdout, expected) ? "passed" : "wrong_answer";
}

/** Signals a crash can end with: `timeout` passes on a killed program's exit code, 128 + the signal. */
const SIGNALS: Record<number, string> = {
  4: "Illegal instruction",
  6: "Aborted",
  7: "Bus error",
  8: "Floating point exception",
  11: "Segmentation fault",
};

const MAX_ERROR_MESSAGE_LENGTH = 300;

/**
 * Where and why a program crashed, read from its standard error, the way
 * each language reports it. The line is the innermost one in the player's own
 * file, where the error actually happened:
 * - Python: the last `File "main.py", line N` of the traceback, and its
 *   last line ("ZeroDivisionError: division by zero").
 * - Go: the first `main.go:N` of the panic's stack, and the `panic:` line.
 * - Java: the first `(Main.java:N)` of the stack trace (Java lists the
 *   innermost frame first), and the exception from the
 *   `Exception in thread "main"` line ("java.lang.ArithmeticException: / by zero").
 * - C++: a crash prints nothing (the judge's GCC is built without the
 *   sanitizers that could say where), so only `assert` gives a line
 *   (`main.cpp:N`); an uncaught exception gives its type and `what()`;
 *   anything else, the signal that ended it.
 */
export function runtimeErrorOf(language: Language, { stderr, exitCode }: TestRun): RuntimeError {
  const lines = stderr
    .split("\n")
    .map((text) => text.trimEnd())
    .filter(Boolean);
  let line: number | null = null;
  let message = "";

  if (language === "python") {
    const frames = [...stderr.matchAll(/File "(?:[^"]*\/)?main\.py", line (\d+)/g)];
    line = frames.length > 0 ? Number(frames.at(-1)![1]) : null;
    message = lines.at(-1) ?? "";
  } else if (language === "go") {
    const frame = /(?:^|\/)main\.go:(\d+)/m.exec(stderr);
    line = frame ? Number(frame[1]) : null;
    message = (lines.find((text) => /^(panic|fatal error): /.test(text)) ?? "").replace(/^panic: /, "");
  } else if (language === "java") {
    const frame = /\(Main\.java:(\d+)\)/.exec(stderr);
    line = frame ? Number(frame[1]) : null;
    message = (lines.find((text) => text.startsWith("Exception in thread ")) ?? "").replace(
      /^Exception in thread "[^"]*" /,
      "",
    );
  } else {
    const assertion = /main\.cpp:(\d+):.*?(Assertion .* failed\.)/.exec(stderr);
    const thrown = /instance of '([^']+)'/.exec(stderr);
    const what = /what\(\):\s*(.*)/.exec(stderr);
    if (assertion) {
      line = Number(assertion[1]);
      message = assertion[2]!;
    } else if (thrown) {
      message = what ? `${thrown[1]}: ${what[1]}` : `Uncaught ${thrown[1]}`;
    }
  }

  if (!message) {
    message = exitCode > 128 && SIGNALS[exitCode - 128] ? SIGNALS[exitCode - 128]! : `Exited with code ${exitCode}`;
  }
  return { line, message: message.slice(0, MAX_ERROR_MESSAGE_LENGTH) };
}

/**
 * The verdict is decided by the first failing test, in the tests' fixed
 * order. `failedTest` is that test's number, counting from 1, for admins.
 */
export function decideVerdict(
  tests: readonly Observation[],
  runs: readonly TestRun[],
  ranOutOfTime: boolean,
): { result: SubmissionResult; failedTest: number | null } {
  for (const [index, test] of tests.entries()) {
    const verdict = judgeTest(runs[index], test.output, ranOutOfTime);
    if (verdict !== "passed") {
      return { result: { status: verdict, revealed: { input: test.input, output: test.output } }, failedTest: index + 1 };
    }
  }
  return { result: { status: "accepted" }, failedTest: null };
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
  /** Peak memory of the whole run, in KB. */
  memory: z.number().nullish(),
});

// Judge0 status ids. 1 and 2 mean it has not finished yet.
const STATUS_FINISHED_ABOVE = 2;
const STATUS_TIME_LIMIT = 5;
const STATUS_COMPILE_ERROR = 6;
const STATUS_INTERNAL_ERROR = 13;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What came back from running a program on some inputs. */
type Execution =
  | { compiled: false; message: string }
  | { compiled: true; runs: TestRun[]; ranOutOfTime: boolean; memoryKb: number | null };

/**
 * A judged submission: the result the player is sent, and, for admins only,
 * how the program ran (see the `submissions` columns of the same names).
 */
export type JudgedSubmission = {
  result: SubmissionResult;
  timeMs: number | null;
  memoryKb: number | null;
  failedTest: number | null;
};

/** The two things the judge can do with a player's program. */
export type Judge = {
  /** Judge it against the level's hidden tests. Costs the player if it fails. */
  submit: (level: Level, submission: SubmissionRequest) => Promise<JudgedSubmission>;
  /** Try it against observations the player already has. Free. */
  run: (
    level: Level,
    submission: SubmissionRequest,
    observations: readonly Observation[],
  ) => Promise<RunResult>;
};

export function createJudge(levels: readonly LoadedLevel[], judge0Url: string): Judge {
  const byId = new Map(levels.map((loaded) => [loaded.level.id, loaded]));
  const find = (level: Level) => {
    const loaded = byId.get(level.id);
    if (!loaded) throw new Error(`Level ${level.id} is not loaded`);
    return loaded;
  };

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

  /** Compiles the program once in Judge0 and runs it on each input in turn. */
  const execute = async (
    loaded: LoadedLevel,
    { language, code }: SubmissionRequest,
    inputs: readonly string[],
    isSubmission: boolean,
  ): Promise<Execution> => {
    const toolchain = TOOLCHAINS[language];
    const timeLimitSeconds = loaded.timeLimitMs / 1000;
    // Made up per submission so a program's own output is not mistaken for it.
    const marker = `@@${randomBytes(16).toString("hex")}`;

    const archive = zipSync({
      [toolchain.file]: strToU8(code),
      compile: strToU8(`#!/bin/bash\n${toolchain.compile}\n`),
      run: strToU8(runScript(toolchain.run, timeLimitSeconds, marker, isSubmission)),
    });

    const { token } = judge0TokenSchema.parse(
      await judge0("/submissions?base64_encoded=true", {
        language_id: MULTI_FILE_LANGUAGE_ID,
        additional_files: toBase64(archive),
        stdin: toBase64(packInputs(inputs)),
        cpu_time_limit: Math.min(MAX_CPU_SECONDS, inputs.length * timeLimitSeconds + 2),
        wall_time_limit: Math.min(MAX_WALL_SECONDS, inputs.length * timeLimitSeconds + 5),
        memory_limit: Math.min(MAX_MEMORY_KB, loaded.memoryLimitKb),
      }),
    );

    const deadline = Date.now() + JUDGE_DEADLINE_MS;
    for (;;) {
      const result = judge0ResultSchema.parse(
        await judge0(
          `/submissions/${token}?base64_encoded=true&fields=status,stdout,compile_output,message,memory`,
        ),
      );

      if (result.status.id <= STATUS_FINISHED_ABOVE) {
        if (Date.now() > deadline) throw new Error("Judge0 did not finish in time");
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      if (result.status.id === STATUS_COMPILE_ERROR) {
        return {
          compiled: false,
          message: fromBase64(result.compile_output).trim().slice(0, MAX_COMPILE_MESSAGE_LENGTH),
        };
      }
      if (result.status.id >= STATUS_INTERNAL_ERROR) {
        throw new Error(
          `Judge0 failed: ${result.status.description}. ${fromBase64(result.message)}`,
        );
      }
      return {
        compiled: true,
        runs: parseRuns(fromBase64(result.stdout), marker),
        ranOutOfTime: result.status.id === STATUS_TIME_LIMIT,
        memoryKb: result.memory ?? null,
      };
    }
  };

  return {
    async submit(level, submission) {
      const loaded = find(level);
      const tests = loaded.secrets;
      const execution = await execute(loaded, submission, tests.map((test) => test.input), true);
      if (!execution.compiled) {
        return {
          result: { status: "compile_error", message: execution.message },
          timeMs: null,
          memoryKb: null,
          failedTest: null,
        };
      }
      const { result, failedTest } = decideVerdict(tests, execution.runs, execution.ranOutOfTime);
      const times = execution.runs.map((run) => run.ms).filter((ms) => Number.isFinite(ms));
      return {
        result,
        timeMs: times.length > 0 ? Math.max(...times) : null,
        memoryKb: execution.memoryKb,
        failedTest,
      };
    },

    // Only the player's own observations go into the sandbox here, never a
    // hidden test, which is why this may send the program's output back.
    async run(level, submission, observations) {
      const execution = await execute(
        find(level),
        submission,
        observations.map((observation) => observation.input),
        false,
      );
      if (!execution.compiled) {
        return { status: "compile_error", message: execution.message };
      }
      return {
        status: "ran",
        outcomes: observations.map((observation, index) => {
          const run = execution.runs[index];
          const verdict = judgeTest(run, observation.output, execution.ranOutOfTime);
          return {
            input: observation.input,
            expected: observation.output,
            verdict,
            actual: (run?.stdout ?? "").slice(0, MAX_RUN_OUTPUT_LENGTH),
            error: verdict === "runtime_error" && run ? runtimeErrorOf(submission.language, run) : null,
          };
        }),
      };
    },
  };
}
