import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PYTHON_COMMAND = "python3";
const WORKER_RELATIVE_CANDIDATES = [
  "../../../../vendor/technocore-adapters/adapter_worker.py",
  "../../../vendor/technocore-adapters/adapter_worker.py",
] as const;
const MAX_OUTPUT = 128 * 1024;
const TIMEOUT_MS = 5_000;

export type PythonCaseResult = {
  id: string;
  actual: unknown;
  actualCanonical: string | null;
  unsupported?: string;
};

export function resolvePythonWorkerPath(moduleUrl = import.meta.url): string {
  const workerPath = WORKER_RELATIVE_CANDIDATES
    .map((relative) => fileURLToPath(new URL(relative, moduleUrl)))
    .find(existsSync);
  if (!workerPath) {
    throw new Error("Fixed Python adapter worker is unavailable");
  }
  return workerPath;
}

/** Run only a built-in adapter through the fixed, data-only worker contract. */
export function runPythonAdapter(
  implementationId: string,
  seed: string,
): Promise<PythonCaseResult[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_COMMAND, [resolvePythonWorkerPath()], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Python adapter timed out"));
    }, TIMEOUT_MS);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT) {
        child.kill("SIGKILL");
        reject(new Error("Python adapter output exceeded 128 KiB"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (Buffer.concat(stderr).length < 2_048) stderr.push(chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `Python adapter failed (${code}): ${Buffer.concat(stderr).toString("utf8").slice(0, 500)}`,
          ),
        );
        return;
      }
      try {
        const value = JSON.parse(Buffer.concat(stdout).toString("utf8")) as {
          contract?: string;
          cases?: PythonCaseResult[];
          error?: string;
        };
        if (value.error) throw new Error(value.error);
        if (
          value.contract !== "technocore-gauntlet-adapter/v1" ||
          !Array.isArray(value.cases) ||
          value.cases.length > 100
        ) {
          throw new Error("Python adapter returned an invalid bounded contract");
        }
        resolve(value.cases);
      } catch (error) {
        reject(
          new Error(
            `Python adapter returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    });
    child.stdin.end(
      JSON.stringify({
        contract: "technocore-gauntlet-adapter/v1",
        implementationId,
        seed,
      }),
    );
  });
}