import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { WorkflowDefinition } from "@drassos/designer-model";
import { SaasError, SaasStore, type RunRecord } from "./store.ts";

export interface SaasServer {
  url: string;
  close: () => Promise<void>;
}

export async function startSaasServer(options: { port?: number; engineUrl: string; store?: SaasStore }): Promise<SaasServer> {
  const store = options.store ?? new SaasStore();
  const engineUrl = options.engineUrl.replace(/\/$/, "");
  const server = createServer(async (request, response) => {
    try {
      await route(request, response, store, engineUrl);
    } catch (error) {
      const failure = error instanceof SaasError ? error : new SaasError("Designer request failed", 500, "INTERNAL");
      send(response, failure.status, { error: { code: failure.code, message: failure.message } });
    }
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function route(request: IncomingMessage, response: ServerResponse, store: SaasStore, engineUrl: string): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  if (request.method === "OPTIONS") {
    send(response, 204, null);
    return;
  }
  if (request.method === "POST" && path === "/api/register") {
    const body = await readJson(request);
    const session = store.register({ email: String(body.email ?? ""), password: String(body.password ?? ""), name: String(body.name ?? "") });
    send(response, 201, session);
    return;
  }
  if (request.method === "POST" && path === "/api/login") {
    const body = await readJson(request);
    send(response, 200, store.login({ email: String(body.email ?? ""), password: String(body.password ?? "") }));
    return;
  }
  const user = store.userForToken(bearer(request));
  if (request.method === "POST" && path === "/api/logout") {
    store.logout(bearer(request) ?? "");
    send(response, 204, null);
    return;
  }
  if (request.method === "GET" && path === "/api/me") {
    send(response, 200, { user });
    return;
  }
  if (request.method === "GET" && path === "/api/projects") {
    send(response, 200, { projects: store.listProjects(user) });
    return;
  }
  if (request.method === "POST" && path === "/api/projects") {
    const body = await readJson(request);
    send(response, 201, store.createProject(user, { name: String(body.name ?? ""), description: typeof body.description === "string" ? body.description : undefined }));
    return;
  }
  const project = path.match(/^\/api\/projects\/([^/]+)$/);
  if (project && request.method === "GET") {
    send(response, 200, store.getProject(user, decodeURIComponent(project[1]!)));
    return;
  }
  if (project && request.method === "PATCH") {
    const body = await readJson(request);
    send(response, 200, store.updateProject(user, decodeURIComponent(project[1]!), { name: typeof body.name === "string" ? body.name : undefined, description: typeof body.description === "string" ? body.description : undefined }));
    return;
  }
  const workflows = path.match(/^\/api\/projects\/([^/]+)\/workflows$/);
  if (workflows && request.method === "GET") {
    const projectId = decodeURIComponent(workflows[1]!);
    send(response, 200, { workflows: store.listWorkflows(user, projectId).map(summary) });
    return;
  }
  if (workflows && request.method === "POST") {
    const projectId = decodeURIComponent(workflows[1]!);
    const body = await readJson(request);
    const definition = body.definition as WorkflowDefinition;
    const saved = await engine<{ revision: string }>(engineUrl, "PUT", `/definitions/${encodeURIComponent(definition.id)}`, { definition });
    send(response, 201, { ...summary(store.saveWorkflow(user, projectId, definition)), revision: saved.revision });
    return;
  }
  const workflow = path.match(/^\/api\/projects\/([^/]+)\/workflows\/([^/]+)$/);
  if (workflow && request.method === "GET") {
    send(response, 200, store.getWorkflow(user, decodeURIComponent(workflow[1]!), decodeURIComponent(workflow[2]!)));
    return;
  }
  if (workflow && request.method === "PUT") {
    const body = await readJson(request);
    const definition = body.definition as WorkflowDefinition;
    const saved = await engine<{ revision: string }>(engineUrl, "PUT", `/definitions/${encodeURIComponent(definition.id)}`, { definition, baseRevision: body.baseRevision });
    send(response, 200, { ...summary(store.saveWorkflow(user, decodeURIComponent(workflow[1]!), definition)), revision: saved.revision });
    return;
  }
  const runs = path.match(/^\/api\/projects\/([^/]+)\/workflows\/([^/]+)\/runs$/);
  if (runs && request.method === "GET") {
    const page = pageOf(url);
    const listed = store.listRuns(user, { projectId: decodeURIComponent(runs[1]!), workflowId: decodeURIComponent(runs[2]!) }, page);
    send(response, 200, { ...listed, runs: await decorateRuns(engineUrl, listed.runs) });
    return;
  }
  if (runs && request.method === "POST") {
    const projectId = decodeURIComponent(runs[1]!);
    const workflow = store.getWorkflow(user, projectId, decodeURIComponent(runs[2]!));
    const body = await readJson(request);
    const started = await engine<{ id: string }>(engineUrl, "POST", `/workflows/${encodeURIComponent(workflow.id)}/runs`, {
      input: body.input ?? {},
      version: workflow.version,
      tenantId: user.tenantId,
      projectId,
      environment: typeof body.environment === "string" ? body.environment : "development",
      packageDigest: typeof body.packageDigest === "string" ? body.packageDigest : undefined,
    });
    const record = store.rememberRun(user, projectId, workflow, started.id);
    send(response, 201, { executionId: record.id, version: record.version });
    return;
  }
  const projectRuns = path.match(/^\/api\/projects\/([^/]+)\/runs$/);
  if (projectRuns && request.method === "GET") {
    const page = pageOf(url);
    const listed = store.listRuns(user, { projectId: decodeURIComponent(projectRuns[1]!) }, page);
    send(response, 200, { ...listed, runs: await decorateRuns(engineUrl, listed.runs) });
    return;
  }
  const usage = path.match(/^\/api\/projects\/([^/]+)\/usage$/);
  if (usage && request.method === "GET") {
    store.getProject(user, decodeURIComponent(usage[1]!));
    const report = await engine(engineUrl, "GET", `/usage?projectId=${encodeURIComponent(user.tenantId ? decodeURIComponent(usage[1]!) : "")}`);
    send(response, 200, report);
    return;
  }
  const run = path.match(/^\/api\/projects\/([^/]+)\/workflows\/([^/]+)\/runs\/([^/]+)$/);
  if (run && request.method === "GET") {
    const record = store.getRun(user, decodeURIComponent(run[1]!), decodeURIComponent(run[2]!), decodeURIComponent(run[3]!));
    const detail = await engine(engineUrl, "GET", `/runs/${encodeURIComponent(record.id)}`);
    const usageReport = await engine(engineUrl, "GET", `/runs/${encodeURIComponent(record.id)}/usage`);
    const resourceAccess = await engine<{ resources: unknown[] }>(engineUrl, "GET", `/runs/${encodeURIComponent(record.id)}/resources`).catch(() => ({ resources: [] }));
    const packaged = await engine<{ packageDigest: string | null }>(engineUrl, "GET", `/runs/${encodeURIComponent(record.id)}/package`).catch(() => ({ packageDigest: null }));
    send(response, 200, { definition: record.definition, detail, usage: usageReport, resources: resourceAccess.resources, packageDigest: packaged.packageDigest });
    return;
  }
  const signal = path.match(/^\/api\/projects\/([^/]+)\/workflows\/([^/]+)\/runs\/([^/]+)\/signal$/);
  if (signal && request.method === "POST") {
    const record = store.getRun(user, decodeURIComponent(signal[1]!), decodeURIComponent(signal[2]!), decodeURIComponent(signal[3]!));
    const body = await readJson(request);
    await engine(engineUrl, "POST", `/workflows/${encodeURIComponent(record.id)}/signals/${encodeURIComponent(String(body.name ?? ""))}`, { payload: body.payload ?? {} });
    send(response, 202, { ok: true });
    return;
  }
  const cancel = path.match(/^\/api\/projects\/([^/]+)\/workflows\/([^/]+)\/runs\/([^/]+)\/cancel$/);
  if (cancel && request.method === "POST") {
    const record = store.getRun(user, decodeURIComponent(cancel[1]!), decodeURIComponent(cancel[2]!), decodeURIComponent(cancel[3]!));
    const result = await engine(engineUrl, "POST", `/runs/${encodeURIComponent(record.id)}/cancel`, { reason: "Cancelled from Designer" });
    send(response, 200, result);
    return;
  }
  const resources = path.match(/^\/api\/projects\/([^/]+)\/resources$/);
  if (resources && request.method === "GET") {
    const projectId = decodeURIComponent(resources[1]!);
    store.getProject(user, projectId);
    send(response, 200, await engine(engineUrl, "GET", `/resources?tenantId=${encodeURIComponent(user.tenantId)}&projectId=${encodeURIComponent(projectId)}`));
    return;
  }
  if (resources && request.method === "POST") {
    const projectId = decodeURIComponent(resources[1]!);
    store.getProject(user, projectId);
    const body = await readJson(request);
    send(response, 201, await engine(engineUrl, "POST", "/resources", { ...body, tenantId: user.tenantId, projectId }));
    return;
  }
  const resourceKey = path.match(/^\/api\/projects\/([^/]+)\/resources\/([^/]+)$/);
  if (resourceKey && request.method === "DELETE") {
    const projectId = decodeURIComponent(resourceKey[1]!);
    store.getProject(user, projectId);
    await engine(engineUrl, "DELETE", `/resources/${encodeURIComponent(decodeURIComponent(resourceKey[2]!))}?tenantId=${encodeURIComponent(user.tenantId)}&projectId=${encodeURIComponent(projectId)}`);
    send(response, 204, null);
    return;
  }
  const resourceTest = path.match(/^\/api\/projects\/([^/]+)\/resources\/([^/]+)\/test$/);
  if (resourceTest && request.method === "POST") {
    const projectId = decodeURIComponent(resourceTest[1]!);
    store.getProject(user, projectId);
    const body = await readJson(request);
    send(response, 200, await engine(engineUrl, "POST", `/resources/${encodeURIComponent(decodeURIComponent(resourceTest[2]!))}/test`, { ...body, tenantId: user.tenantId, projectId }));
    return;
  }
  const resourceActions = path.match(/^\/api\/projects\/([^/]+)\/resources\/([^/]+)\/actions$/);
  if (resourceActions && request.method === "POST") {
    const projectId = decodeURIComponent(resourceActions[1]!);
    store.getProject(user, projectId);
    const body = await readJson(request);
    send(response, 201, await engine(engineUrl, "POST", `/resources/${encodeURIComponent(decodeURIComponent(resourceActions[2]!))}/actions`, { ...body, tenantId: user.tenantId, projectId }));
    return;
  }
  const secrets = path.match(/^\/api\/projects\/([^/]+)\/secrets$/);
  if (secrets && request.method === "GET") {
    const projectId = decodeURIComponent(secrets[1]!);
    store.getProject(user, projectId);
    send(response, 200, await engine(engineUrl, "GET", `/secrets?tenantId=${encodeURIComponent(user.tenantId)}&projectId=${encodeURIComponent(projectId)}`));
    return;
  }
  if (secrets && request.method === "POST") {
    const projectId = decodeURIComponent(secrets[1]!);
    store.getProject(user, projectId);
    const body = await readJson(request);
    const created = await engine<{ id: string; name: string }>(engineUrl, "POST", "/secrets", { name: body.name, value: body.value, tenantId: user.tenantId, projectId });
    send(response, 201, { id: created.id, name: created.name });
    return;
  }
  const publishedVersion = path.match(/^\/api\/projects\/([^/]+)\/workflows\/([^/]+)\/published$/);
  if (publishedVersion && request.method === "GET") {
    const projectId = decodeURIComponent(publishedVersion[1]!);
    store.getProject(user, projectId);
    const version = url.searchParams.get("version") ?? "1";
    const result = await engine(
      engineUrl,
      "GET",
      `/workflow-packages/${encodeURIComponent(decodeURIComponent(publishedVersion[2]!))}/${encodeURIComponent(version)}?tenantId=${encodeURIComponent(user.tenantId)}&projectId=${encodeURIComponent(projectId)}`,
    );
    send(response, 200, result);
    return;
  }
  const packaged = path.match(/^\/api\/projects\/([^/]+)\/workflows\/([^/]+)\/(publish|export|import)$/);
  if (packaged && request.method === "POST") {
    const projectId = decodeURIComponent(packaged[1]!);
    store.getProject(user, projectId);
    const body = await readJson(request);
    const action = packaged[3]!;
    const result = await engine(engineUrl, "POST", `/workflow-packages/${action}`, {
      ...body,
      tenantId: user.tenantId,
      projectId,
    });
    send(response, action === "publish" ? 201 : 200, result);
    return;
  }
  const deploymentProxy = path.match(/^\/api\/projects\/([^/]+)\/(deployment-providers|deployment-targets|worker-definitions|deployments)(\/.*)?$/);
  if (deploymentProxy) {
    const projectId = decodeURIComponent(deploymentProxy[1]!);
    store.getProject(user, projectId);
    const enginePath = `/${deploymentProxy[2]}${deploymentProxy[3] ?? ""}`;
    if (request.method === "GET") {
      const join = enginePath.includes("?") ? "&" : "?";
      send(response, 200, await engine(engineUrl, "GET", `${enginePath}${join}tenantId=${encodeURIComponent(user.tenantId)}&projectId=${encodeURIComponent(projectId)}`));
      return;
    }
    if (request.method === "POST") {
      const body = await readJson(request);
      const result = await engine(engineUrl, "POST", enginePath, { ...body, tenantId: user.tenantId, projectId });
      send(response, enginePath.endsWith("/plan") || enginePath.endsWith("/scale") || enginePath.endsWith("/reconcile") ? 200 : 201, result);
      return;
    }
  }
  throw new SaasError("That Designer resource was not found", 404, "NOT_FOUND");
}

function summary(workflow: { id: string; name: string; version: string; updatedAt: string }) {
  return { id: workflow.id, name: workflow.name, version: workflow.version, updatedAt: workflow.updatedAt };
}

async function decorateRuns(engineUrl: string, runs: RunRecord[]) {
  return Promise.all(runs.map(async (run) => {
    const detail = await engine<{ run?: { status?: string; startedAt?: string | null; completedAt?: string | null } }>(engineUrl, "GET", `/runs/${encodeURIComponent(run.id)}`).catch(() => null);
    const usage = await engine<{ cost?: { state: string; amount: string | null; currency: string | null } }>(engineUrl, "GET", `/runs/${encodeURIComponent(run.id)}/usage`).catch(() => null);
    return {
      id: run.id,
      workflowId: run.workflowId,
      version: run.version,
      createdAt: run.createdAt,
      status: detail?.run?.status ?? "UNKNOWN",
      startedAt: detail?.run?.startedAt ?? null,
      completedAt: detail?.run?.completedAt ?? null,
      cost: usage?.cost ?? { state: "unavailable", amount: null, currency: null },
    };
  }));
}

function pageOf(url: URL): { limit: number; offset: number } {
  return {
    limit: Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25))),
    offset: Math.max(0, Number(url.searchParams.get("offset") ?? 0)),
  };
}

function bearer(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  return header?.toLowerCase().startsWith("bearer ") ? header.slice(7) : undefined;
}

async function engine<T>(engineUrl: string, method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${engineUrl}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new SaasError(`Drassos Engine is unavailable (${error instanceof Error ? error.message : "network"})`, 503, "ENGINE_UNAVAILABLE");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
    throw new SaasError(payload.error?.message ?? "Drassos Engine request failed", response.status, payload.error?.code ?? "ENGINE_ERROR");
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = body == null ? "" : JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  });
  response.end(payload);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}
