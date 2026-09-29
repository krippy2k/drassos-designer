import { useEffect, useState } from "react";
import { designerHref, formatCost, parseDesignerRoute, type DesignerRoute, type WorkflowDefinition } from "@drassos/designer-model";
import { App } from "../App.tsx";
import { WorkflowPackageActions } from "./WorkflowPackages.tsx";
import { Deployments } from "./Deployments.tsx";
import { Resources } from "./Resources.tsx";
import { RunView, type UsageReport } from "./RunView.tsx";

const SESSION_KEY = "drassos-designer-session";

export function Shell() {
  const [route, setRoute] = useState<DesignerRoute>(() => parseDesignerRoute(window.location.hash));
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(SESSION_KEY));
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(parseDesignerRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!token && route.name !== "login" && route.name !== "register") {
      window.location.hash = "#/login";
      setRoute({ name: "login" });
    }
  }, [token, route.name]);

  function saveSession(next: string) {
    sessionStorage.setItem(SESSION_KEY, next);
    setToken(next);
    window.location.hash = "#/projects";
    setRoute({ name: "projects" });
  }

  function signOut() {
    const current = sessionStorage.getItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setToken(null);
    setBanner(null);
    if (current) {
      void fetch("/api/logout", { method: "POST", headers: { authorization: `Bearer ${current}` } }).catch(() => undefined);
    }
    window.location.hash = "#/login";
    setRoute({ name: "login" });
  }

  if (!token) {
    return route.name === "register" ? <Auth mode="register" onSession={saveSession} /> : <Auth mode="login" onSession={saveSession} />;
  }

  return (
    <div className="saas">
      <header className="toolbar">
        <a className="brand brand-small" href={designerHref({ name: "projects" })}>
          Drass<span>os</span>
        </a>
        <nav className="toolbar-nav">
          <a href={designerHref({ name: "projects" })}>Projects</a>
          <button type="button" className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </nav>
      </header>
      {banner ? <p className="banner">{banner}</p> : null}
      <Authenticated token={token} route={route} onError={setBanner} />
    </div>
  );
}

function Authenticated(props: { token: string; route: DesignerRoute; onError: (message: string | null) => void }) {
  if (props.route.name === "projects" || props.route.name === "login" || props.route.name === "register") {
    return <Projects token={props.token} onError={props.onError} />;
  }
  if (props.route.name === "project") {
    return <Project token={props.token} projectId={props.route.projectId} section={props.route.section} onError={props.onError} />;
  }
  if (props.route.name === "workflow" && props.route.section === "design") {
    return (
      <App
        lockedWorkflowId={props.route.workflowId}
        projectId={props.route.projectId}
        sessionToken={props.token}
        resourcesPath={`/api/projects/${props.route.projectId}/resources`}
        startRun={(workflowId, input, _version, environment, packageDigest) =>
          api(props.token, "POST", `/api/projects/${props.route.projectId}/workflows/${workflowId}/runs`, { input, environment, packageDigest })
        }
        renderPackages={(state) => (
          <WorkflowPackageActions
            definition={state.definition}
            token={props.token}
            projectId={props.route.name === "workflow" ? props.route.projectId : ""}
            published={state.published}
            onPublished={state.onPublished}
            onImported={state.onImported}
            onOpened={state.onOpened}
            onError={state.onError}
          />
        )}
      />
    );
  }
  if (props.route.name === "workflow") {
    return <Project token={props.token} projectId={props.route.projectId} section="runs" workflowId={props.route.workflowId} onError={props.onError} />;
  }
  return <RunPage token={props.token} route={props.route} onError={props.onError} />;
}

function Auth(props: { mode: "login" | "register"; onSession: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="auth-stage">
      <section className="auth-card">
        <div className="brand">
          Drass<span>os</span>
        </div>
        <p className="auth-kicker">Designer</p>
        <h1>{props.mode === "login" ? "Sign in" : "Create account"}</h1>
        <p className="auth-lede">
          {props.mode === "login" ? "Open your projects and watch workflows run." : "Create an account for your workflows."}
        </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const path = props.mode === "login" ? "/api/login" : "/api/register";
          void api(null, "POST", path, { email, password, name })
            .then((body) => props.onSession(String(body.token)))
            .catch((failure: Error) => setError(failure.message));
        }}
      >
        {props.mode === "register" ? (
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        ) : null}
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button type="submit">{props.mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      {error ? <p className="banner">{error}</p> : null}
      <p className="auth-switch">
        {props.mode === "login" ? <a href="#/register">Create an account</a> : <a href="#/login">Already have an account? Sign in</a>}
      </p>
      </section>
    </main>
  );
}

function Projects(props: { token: string; onError: (message: string | null) => void }) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string; description?: string }>>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void loadProjects(props.token).then(setProjects).catch((error: Error) => props.onError(error.message));
  }, [props]);
  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="auth-kicker page-kicker">Workspace</p>
          <h1>Projects</h1>
          <p className="lede">Workflows, runs, and cost for this account.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>New project</button>
      </header>
      {projects.length === 0 ? (
        <div className="empty-panel">
          <p>No projects yet.</p>
          <p>Create one to start designing workflows.</p>
        </div>
      ) : (
        <ul className="card-list">
          {projects.map((project) => (
            <li key={project.id}>
              <a href={designerHref({ name: "project", projectId: project.id, section: "overview" })}>
                <strong>{project.name}</strong>
                <span>{project.description || "Open project"}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <DetailsDialog
          title="New project"
          lede="Name the project. You can add workflows after it is created."
          submitLabel="Create project"
          description
          onClose={() => setOpen(false)}
          onSubmit={(name, description) =>
            api(props.token, "POST", "/api/projects", { name, description })
              .then(() => loadProjects(props.token))
              .then((next) => {
                setProjects(next);
                setOpen(false);
              })
          }
        />
      ) : null}
    </main>
  );
}

function loadProjects(token: string): Promise<Array<{ id: string; name: string; description?: string }>> {
  return api(token, "GET", "/api/projects").then((body) => body.projects as Array<{ id: string; name: string; description?: string }>);
}

function Project(props: {
  token: string;
  projectId: string;
  section: "overview" | "workflows" | "runs" | "usage" | "resources" | "deployments" | "settings";
  workflowId?: string;
  onError: (message: string | null) => void;
}) {
  const [project, setProject] = useState<{ name: string; description?: string } | null>(null);
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string; version: string; updatedAt: string }>>([]);
  const [runs, setRuns] = useState<Array<{ id: string; workflowId: string; status: string; version: string; cost: { state: "complete" | "partial" | "unavailable" | "calculating"; amount: string | null; currency: string | null } }>>([]);
  const [usage, setUsage] = useState<UsageReport | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    void api(props.token, "GET", `/api/projects/${props.projectId}`)
      .then((body) => setProject(body as { name: string }))
      .catch((error: Error) => props.onError(error.message));
    void api(props.token, "GET", `/api/projects/${props.projectId}/workflows`)
      .then((body) => setWorkflows(body.workflows as typeof workflows))
      .catch((error: Error) => props.onError(error.message));
    const runsPath = props.workflowId
      ? `/api/projects/${props.projectId}/workflows/${props.workflowId}/runs`
      : `/api/projects/${props.projectId}/runs`;
    void api(props.token, "GET", runsPath)
      .then((body) => setRuns(body.runs as typeof runs))
      .catch((error: Error) => props.onError(error.message));
    if (props.section === "usage") {
      void api(props.token, "GET", `/api/projects/${props.projectId}/usage`)
        .then((body) => setUsage(body as unknown as UsageReport))
        .catch((error: Error) => props.onError(error.message));
    }
  }, [props]);
  const sections = [
    ["overview", "Overview"],
    ["workflows", "Workflows"],
    ["runs", "Runs"],
    ["usage", "Usage / Cost"],
    ["resources", "Resources"],
    ["deployments", "Deployments"],
    ["settings", "Settings"],
  ] as const;
  return (
    <main className="page project">
      <header className="page-head">
        <div>
          <p className="auth-kicker page-kicker">Project</p>
          <h1>{project?.name ?? "Project"}</h1>
          {project?.description ? <p className="lede">{project.description}</p> : null}
        </div>
      </header>
      <nav className="section-nav">
        {sections.map(([section, label]) => (
          <a
            key={section}
            className={props.section === section ? "active" : undefined}
            href={designerHref({ name: "project", projectId: props.projectId, section })}
          >
            {label}
          </a>
        ))}
      </nav>
      {props.section === "workflows" || props.section === "overview" ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Workflows</h2>
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>New workflow</button>
          </div>
          {workflows.length === 0 ? <p className="muted">No workflows yet.</p> : null}
          <ul className="card-list">
            {workflows.map((workflow) => (
              <li key={workflow.id}>
                <a href={designerHref({ name: "workflow", projectId: props.projectId, workflowId: workflow.id, section: "design" })}>
                  <strong>{workflow.name}</strong>
                  <span>{workflow.id} · {workflow.version}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {props.section === "runs" || props.section === "overview" ? (
        <section className="panel">
          <h2>Runs</h2>
          {runs.length === 0 ? <p className="muted">No runs yet.</p> : null}
          <ul className="card-list">
            {runs.map((run) => (
              <li key={run.id}>
                <a href={designerHref({ name: "run", projectId: props.projectId, workflowId: run.workflowId, runId: run.id })}>
                  <strong>{run.id}</strong>
                  <span>{run.status} · {run.version}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {props.section === "usage" ? (
        <section className="panel">
          <h2>Usage / Cost</h2>
          {usage && usage.events.length === 0 ? <p className="muted">No usage yet.</p> : null}
          {usage ? <p className="cost-figure">Cost {formatCost(usage.cost)}</p> : null}
        </section>
      ) : null}
      {props.section === "resources" ? <Resources token={props.token} projectId={props.projectId} onError={props.onError} /> : null}
      {props.section === "deployments" ? <Deployments token={props.token} projectId={props.projectId} onError={props.onError} /> : null}
      {props.section === "settings" ? <p className="muted">Project settings stay with this account.</p> : null}
      {creating ? (
        <DetailsDialog
          title="New workflow"
          lede="Start with a blank canvas. You can connect steps after it opens."
          submitLabel="Create workflow"
          onClose={() => setCreating(false)}
          onSubmit={(name) => {
            const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workflow";
            const definition: WorkflowDefinition = {
              schemaVersion: "1",
              id,
              name: name.trim() || "Workflow",
              version: "1",
              nodes: [
                { id: "start", type: "start", name: "Start", config: {} },
                { id: "end", type: "end", name: "End", config: {} },
              ],
              edges: [{ id: "start-to-end", source: "start", target: "end" }],
              metadata: { designer: { layout: { start: { x: 80, y: 160 }, end: { x: 420, y: 160 } } } },
            };
            return api(props.token, "POST", `/api/projects/${props.projectId}/workflows`, { definition }).then(() => {
              window.location.hash = designerHref({ name: "workflow", projectId: props.projectId, workflowId: id, section: "design" });
            });
          }}
        />
      ) : null}
    </main>
  );
}

function DetailsDialog(props: {
  title: string;
  lede: string;
  submitLabel: string;
  description?: boolean;
  onClose: () => void;
  onSubmit: (name: string, description?: string) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="details-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          void props.onSubmit(name, description.trim() || undefined).catch((failure: Error) => setError(failure.message));
        }}
      >
        <h2 id="details-dialog-title">{props.title}</h2>
        <p>{props.lede}</p>
        <label>
          Name
          <input value={name} autoFocus required onChange={(event) => setName(event.target.value)} />
        </label>
        {props.description ? (
          <label>
            Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        ) : null}
        {error ? <p className="banner">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={props.onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{props.submitLabel}</button>
        </div>
      </form>
    </div>
  );
}

function RunPage(props: { token: string; route: Extract<DesignerRoute, { name: "run" }>; onError: (message: string | null) => void }) {
  const [body, setBody] = useState<{ definition: WorkflowDefinition; detail: Parameters<typeof RunView>[0]["detail"]; usage: UsageReport; resources?: Parameters<typeof RunView>[0]["resources"]; packageDigest?: string | null } | null>(null);
  useEffect(() => {
    let stopped = false;
    const load = () => {
      void api(props.token, "GET", `/api/projects/${props.route.projectId}/workflows/${props.route.workflowId}/runs/${props.route.runId}`)
        .then((next) => {
          if (!stopped) {
            setBody(next as unknown as NonNullable<typeof body>);
          }
        })
        .catch((error: Error) => props.onError(error.message));
    };
    load();
    const timer = setInterval(load, 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [props]);
  if (!body) {
    return <p>Loading run…</p>;
  }
  return (
    <div>
      <p><a href={designerHref({ name: "workflow", projectId: props.route.projectId, workflowId: props.route.workflowId, section: "runs" })}>Back to runs</a></p>
      <RunView definition={body.definition} detail={body.detail} usage={body.usage} resources={body.resources} packageDigest={body.packageDigest} />
    </div>
  );
}

async function api(token: string | null, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Network failure. The Designer service is unreachable.");
  }
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const record = payload as { error?: { code?: string; message?: string } };
    const code = record.error?.code;
    if (response.status === 401 || code === "AUTHENTICATION_FAILED") {
      throw new Error("Authentication failed. Sign in again.");
    }
    if (response.status === 403) {
      throw new Error("You are not allowed to open that resource.");
    }
    if (response.status === 404) {
      throw new Error(record.error?.message ?? "That resource was not found.");
    }
    if (code === "ENGINE_UNAVAILABLE") {
      throw new Error(record.error?.message ?? "Drassos Engine is unavailable.");
    }
    if (code === "VERSION_CONFLICT") {
      throw new Error("Reload before saving. The remote workflow revision changed.");
    }
    if (response.status >= 500 || !record.error?.message) {
      throw new Error("The Designer account service is unavailable.");
    }
    throw new Error(record.error.message);
  }
  return payload as Record<string, unknown>;
}
