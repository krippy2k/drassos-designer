import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import type { WorkflowDefinition } from "./types.ts";
import { buildPackage } from "../../../../drassos-engine/packages/engine/src/packages/package.ts";
import { sourceToDefinition } from "../../../../drassos-engine/packages/engine/src/packages/source.ts";
import {
  extractInlineActivity,
  generateNodeProject,
  implementationCounts,
  zipTextFiles,
} from "./activities.ts";

const inlineSource = "export default async function execute(input: Input, context: ActivityContext): Promise<Output> {\n  return { total: input.quantity * input.unitPrice };\n}";

function projectDefinition(): WorkflowDefinition {
  return {
    schemaVersion: "1",
    id: "order-workflow",
    name: "Order Workflow",
    version: "1.0.0",
    nodes: [
      { id: "start", type: "start", name: "Start", config: {} },
      {
        id: "price",
        type: "activity",
        name: "Calculate Price",
        config: {
          activity: "calculate-price",
          contract: { input: { quantity: { type: "number" }, unitPrice: { type: "number" } }, output: { total: { type: "number" } } },
          implementation: { type: "inline-typescript", source: inlineSource },
        },
      },
      { id: "charge", type: "activity", name: "Charge Customer", config: { activity: "charge-customer", implementation: { type: "unimplemented" } } },
      { id: "send", type: "activity", name: "Send Confirmation", config: { activity: "send-confirmation", implementation: { type: "external", activityName: "send-confirmation" } } },
      { id: "end", type: "end", name: "End", config: {} },
    ],
    edges: [
      { id: "start-to-price", source: "start", target: "price" },
      { id: "price-to-charge", source: "price", target: "charge" },
      { id: "charge-to-send", source: "charge", target: "send" },
      { id: "send-to-end", source: "send", target: "end" },
    ],
  };
}

describe("node project generation", () => {
  it("exports stubs, inline source, and a package the engine can build", async () => {
    const definition = projectDefinition();
    expect(implementationCounts(definition)).toEqual({ unimplemented: 1, inline: 1, external: 1, total: 3 });
    const files = generateNodeProject(definition);
    expect(generateNodeProject(definition)).toEqual(files);
    expect(JSON.stringify(files)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(files["activities/calculate-price.ts"]).toContain("input.quantity * input.unitPrice");
    expect(files["activities/calculate-price.ts"]).toContain("quantity: number");
    expect(files["activities/charge-customer.ts"]).toContain("Not implemented");
    expect(files["activities/charge-customer.ts"]).toContain("charge-customer");
    expect(files["activities/send-confirmation.ts"]).toContain("send-confirmation");
    expect(files["package.json"]).toContain("\"validate\": \"drassos validate\"");
    expect(files["package.json"]).toContain("\"package\": \"drassos package\"");
    expect(new TextDecoder().decode(zipTextFiles(files))).toContain("package.json");

    const restored = sourceToDefinition(files);
    const price = restored.nodes.find((node) => node.id === "price");
    expect(price?.config).toMatchObject({ activity: "calculate-price", implementation: { type: "inline-typescript" } });
    expect((price?.config as { implementation?: { source?: string } }).implementation?.source).toContain("unitPrice");
    const packaged = buildPackage(files);
    expect(packaged.manifest.workflow).toBe("order-workflow");
    expect(packaged.files["activities/charge-customer.ts"]).toContain("Not implemented");

    await typecheckAndRun(files);
  });

  it("extracts an inline activity to an external activity and keeps its id", () => {
    const node = projectDefinition().nodes.find((item) => item.id === "price")!;
    const extracted = extractInlineActivity(node);
    expect(extracted.path).toBe("activities/calculate-price.ts");
    expect(extracted.source).toContain("unitPrice");
    expect(extracted.config).toMatchObject({
      activity: "calculate-price",
      implementation: { type: "external", activityName: "calculate-price" },
      contract: { output: { total: { type: "number" } } },
    });
  });
});

async function typecheckAndRun(files: Record<string, string>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "drassos-project-"));
  const compiled = join(dir, "compiled");
  try {
    const typeRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../node_modules/@types");
    const names: string[] = [];
    for (const [path, content] of Object.entries(files)) {
      if (!path.endsWith(".ts")) {
        continue;
      }
      const destination = join(dir, path);
      names.push(destination);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, content);
      const javascript = ts.transpileModule(content, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: path,
      }).outputText.replaceAll(".ts\"", ".js\"");
      const runtime = join(compiled, path.replace(/\.ts$/, ".js"));
      await mkdir(dirname(runtime), { recursive: true });
      await writeFile(runtime, javascript);
    }
    const program = ts.createProgram(names, compilerOptions(typeRoot));
    const diagnostics = ts.getPreEmitDiagnostics(program).filter((item) => item.category === ts.DiagnosticCategory.Error);
    expect(diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n"))).toEqual([]);
    const tests = Object.keys(files)
      .filter((path) => path.startsWith("tests/") && path.endsWith(".test.ts"))
      .map((path) => path.replace(/\.ts$/, ".js"));
    await runNode(["--test", ...tests], compiled);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function compilerOptions(typeRoot: string): ts.CompilerOptions {
  return {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    types: ["node"],
    typeRoots: [typeRoot],
  };
}

function runNode(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: "pipe" });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(output || `node exited ${code}`));
    });
  });
}
