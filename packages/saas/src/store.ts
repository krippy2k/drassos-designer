import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { WorkflowDefinition } from "@drassos/designer-model";

export class SaasError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRecord {
  id: string;
  projectId: string;
  tenantId: string;
  name: string;
  version: string;
  definition: WorkflowDefinition;
  updatedAt: string;
}

export interface RunRecord {
  id: string;
  projectId: string;
  tenantId: string;
  workflowId: string;
  version: string;
  definition: WorkflowDefinition;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
}

interface Persisted {
  users: Array<SessionUser & { passwordHash: string; salt: string }>;
  projects: Project[];
  workflows: WorkflowRecord[];
  runs: RunRecord[];
  sessions: Array<{ token: string; userId: string }>;
}

export class SaasStore {
  private data: Persisted;

  constructor(private readonly file?: string) {
    this.data = file ? readPersisted(file) : emptyData();
  }

  register(input: { email: string; password: string; name: string }): { token: string; user: SessionUser } {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password || !input.name.trim()) {
      throw new SaasError("Email, name, and password are required", 400, "INVALID_REQUEST");
    }
    if (this.data.users.some((user) => user.email === email)) {
      throw new SaasError("An account with that email already exists", 409, "ACCOUNT_EXISTS");
    }
    const salt = randomBytes(16).toString("hex");
    const user = {
      id: randomUUID(),
      email,
      name: input.name.trim(),
      tenantId: randomUUID(),
      passwordHash: hashPassword(input.password, salt),
      salt,
    };
    this.data.users.push(user);
    return this.sessionFor(user);
  }

  login(input: { email: string; password: string }): { token: string; user: SessionUser } {
    const email = input.email.trim().toLowerCase();
    const user = this.data.users.find((item) => item.email === email);
    if (!user || !passwordMatches(input.password, user.salt, user.passwordHash)) {
      throw new SaasError("Email or password is incorrect", 401, "AUTHENTICATION_FAILED");
    }
    return this.sessionFor(user);
  }

  logout(token: string): void {
    this.data.sessions = this.data.sessions.filter((session) => session.token !== token);
    this.persist();
  }

  userForToken(token: string | undefined): SessionUser {
    const session = token ? this.data.sessions.find((item) => item.token === token) : undefined;
    const user = session ? this.data.users.find((item) => item.id === session.userId) : undefined;
    if (!user) {
      throw new SaasError("Sign in is required", 401, "AUTHENTICATION_FAILED");
    }
    return publicUser(user);
  }

  createProject(user: SessionUser, input: { name: string; description?: string }): Project {
    const name = input.name.trim();
    if (!name) {
      throw new SaasError("Project name is required", 400, "INVALID_REQUEST");
    }
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      tenantId: user.tenantId,
      name,
      description: input.description?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    this.data.projects.push(project);
    this.persist();
    return project;
  }

  listProjects(user: SessionUser): Project[] {
    return this.data.projects.filter((project) => project.tenantId === user.tenantId);
  }

  getProject(user: SessionUser, projectId: string): Project {
    const project = this.data.projects.find((item) => item.id === projectId && item.tenantId === user.tenantId);
    if (!project) {
      throw new SaasError("Project was not found", 404, "NOT_FOUND");
    }
    return project;
  }

  updateProject(user: SessionUser, projectId: string, patch: { name?: string; description?: string }): Project {
    const project = this.getProject(user, projectId);
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) {
        throw new SaasError("Project name is required", 400, "INVALID_REQUEST");
      }
      project.name = name;
    }
    if (patch.description !== undefined) {
      project.description = patch.description.trim() || undefined;
    }
    project.updatedAt = new Date().toISOString();
    this.persist();
    return project;
  }

  saveWorkflow(user: SessionUser, projectId: string, definition: WorkflowDefinition): WorkflowRecord {
    this.getProject(user, projectId);
    const now = new Date().toISOString();
    const existing = this.data.workflows.find((item) => item.id === definition.id && item.tenantId === user.tenantId);
    if (existing && existing.projectId !== projectId) {
      throw new SaasError("Workflow was not found", 404, "NOT_FOUND");
    }
    if (existing) {
      existing.name = definition.name;
      existing.version = definition.version;
      existing.definition = definition;
      existing.updatedAt = now;
      this.persist();
      return existing;
    }
    const record: WorkflowRecord = {
      id: definition.id,
      projectId,
      tenantId: user.tenantId,
      name: definition.name,
      version: definition.version,
      definition,
      updatedAt: now,
    };
    this.data.workflows.push(record);
    this.persist();
    return record;
  }

  listWorkflows(user: SessionUser, projectId: string): WorkflowRecord[] {
    this.getProject(user, projectId);
    return this.data.workflows.filter((item) => item.projectId === projectId && item.tenantId === user.tenantId);
  }

  getWorkflow(user: SessionUser, projectId: string, workflowId: string): WorkflowRecord {
    this.getProject(user, projectId);
    const workflow = this.data.workflows.find((item) => item.id === workflowId && item.projectId === projectId && item.tenantId === user.tenantId);
    if (!workflow) {
      throw new SaasError("Workflow was not found", 404, "NOT_FOUND");
    }
    return workflow;
  }

  rememberRun(user: SessionUser, projectId: string, workflow: WorkflowRecord, runId: string): RunRecord {
    const record: RunRecord = {
      id: runId,
      projectId,
      tenantId: user.tenantId,
      workflowId: workflow.id,
      version: workflow.version,
      definition: structuredClone(workflow.definition),
      createdAt: new Date().toISOString(),
    };
    this.data.runs.push(record);
    this.persist();
    return record;
  }

  listRuns(user: SessionUser, filter: { projectId: string; workflowId?: string; status?: string }, page: { limit: number; offset: number }): { runs: RunRecord[]; total: number } {
    this.getProject(user, filter.projectId);
    const matched = this.data.runs.filter((run) => run.tenantId === user.tenantId && run.projectId === filter.projectId && (!filter.workflowId || run.workflowId === filter.workflowId));
    return { runs: matched.slice(page.offset, page.offset + page.limit), total: matched.length };
  }

  getRun(user: SessionUser, projectId: string, workflowId: string, runId: string): RunRecord {
    this.getWorkflow(user, projectId, workflowId);
    const run = this.data.runs.find((item) => item.id === runId && item.projectId === projectId && item.workflowId === workflowId && item.tenantId === user.tenantId);
    if (!run) {
      throw new SaasError("Run was not found", 404, "NOT_FOUND");
    }
    return run;
  }

  private sessionFor(user: Persisted["users"][number]): { token: string; user: SessionUser } {
    const token = randomBytes(24).toString("hex");
    this.data.sessions.push({ token, userId: user.id });
    this.persist();
    return { token, user: publicUser(user) };
  }

  private persist(): void {
    if (!this.file) {
      return;
    }
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data));
  }
}

function emptyData(): Persisted {
  return { users: [], projects: [], workflows: [], runs: [], sessions: [] };
}

function readPersisted(file: string): Persisted {
  try {
    return { ...emptyData(), ...(JSON.parse(readFileSync(file, "utf8")) as Persisted) };
  } catch {
    return emptyData();
  }
}

function publicUser(user: Persisted["users"][number]): SessionUser {
  return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId };
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString("hex");
}

function passwordMatches(password: string, salt: string, expected: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const stored = Buffer.from(expected, "hex");
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}
