import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

/**
 * Compiling and running the programs that come with a level: validators,
 * machines and wrong-answer solutions. All of it is our own trusted code.
 * Player code never comes near this file; it runs only in Judge0.
 */

/** Something `run` can start: a compiled binary, or an interpreter and a script. */
export type Program = { command: string; args: string[] };

export type RunResult = {
  /** `null` if the process was killed rather than exiting. */
  exitCode: number | null;
  /** The signal that killed it, e.g. `SIGKILL` (also what the out-of-memory killer sends). */
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

const CXX_FLAGS = ["-std=c++17", "-O2"];
const COMPILE_TIMEOUT_MS = 120_000;
/** Stop collecting output past this many characters, so a runaway program cannot fill memory. */
const MAX_OUTPUT_LENGTH = 1_000_000;

/** Starts the program, feeds it `stdin`, and waits for it to exit or time out. */
export function run(program: Program, stdin: string, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(program.command, program.args);
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      if (stdout.length < MAX_OUTPUT_LENGTH) stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      if (stderr.length < MAX_OUTPUT_LENGTH) stderr += chunk;
    });

    // "error" means the process could not be started at all (e.g. no g++).
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal, stdout, stderr, timedOut });
    });

    // A program that exits without reading its input closes the pipe on us;
    // that is not an error worth crashing for.
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}

/**
 * Compiles run one at a time. A testlib validator takes about 265 MB and a few
 * seconds to compile; several at once on a small server (which is also running
 * the database and the build) can exhaust its memory.
 */
let compileQueue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const result = compileQueue.then(task);
  // The next task waits for this one whether it succeeds or fails.
  compileQueue = result.catch(() => {});
  return result;
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/**
 * Turns a source file into something runnable. Python is run as it is. C++ is
 * compiled into `cacheDir` under a name made from a hash of everything that
 * affects the binary (flags, the source, and `headers` such as testlib.h), so
 * an unchanged file is compiled once and then reused across restarts.
 */
export async function prepare(
  sourcePath: string,
  cacheDir: string,
  headers: string[] = [],
): Promise<Program> {
  const extension = extname(sourcePath);
  if (extension === ".py") {
    return { command: "python3", args: [sourcePath] };
  }
  if (extension !== ".cpp") {
    throw new Error(`${sourcePath}: only .cpp and .py programs are supported`);
  }

  const hash = createHash("sha256").update(CXX_FLAGS.join(" "));
  for (const path of [sourcePath, ...headers]) {
    hash.update(await readFile(path));
  }
  const binary = join(cacheDir, hash.digest("hex"));

  await oneAtATime(async () => {
    // Checked again here: an identical file queued earlier may have built it.
    if (await exists(binary)) return;
    await mkdir(cacheDir, { recursive: true });
    // Compile under a temporary name and rename, so a half-written binary is
    // never mistaken for a finished one.
    const temporary = `${binary}.${process.pid}.tmp`;
    const includes = headers.map((header) => `-I${dirname(header)}`);
    const compiled = await run(
      { command: "g++", args: [...CXX_FLAGS, ...includes, "-o", temporary, sourcePath] },
      "",
      COMPILE_TIMEOUT_MS,
    );
    if (compiled.timedOut) {
      throw new Error(
        `${sourcePath} took over ${COMPILE_TIMEOUT_MS / 1000} s to compile and was stopped. ` +
          "Normally it takes seconds: the machine is probably short of memory or CPU.",
      );
    }
    if (compiled.signal) {
      throw new Error(
        `g++ was killed (${compiled.signal}) compiling ${sourcePath}. ` +
          "With no timeout, that is usually the out-of-memory killer: the machine is short of memory.",
      );
    }
    if (compiled.exitCode !== 0) {
      throw new Error(`${sourcePath} did not compile:\n${compiled.stderr}`);
    }
    await rename(temporary, binary);
  });
  return { command: binary, args: [] };
}
