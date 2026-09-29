import { useEffect, useState } from "react";

interface ProviderRow { name: string; type: string }
interface TargetRow { name: string; providerName: string; config: { namespace?: string } }
interface WorkerRow { name: string; management: string; targetName: string | null; capabilities: string[]; scaling: { minInstances?: number; maxInstances?: number; concurrency?: { maxPerInstance?: number } } }
interface DeploymentRow { id: string; workerName: string; targetName: string; providerType: string; status: string; error: string | null }
interface InstanceRow { id: string; health: string; cpu: string | null; memory: string | null; estimatedCost: { amount: string; currency: string; estimated: boolean } | null }

export function Deployments(props: { token: string; projectId: string; onError: (message: string) => void }) {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [deployments, setDeployments] = useState<DeploymentRow[]>([]);
  const [instances, setInstances] = useState<Record<string, InstanceRow[]>>({});
  const [dialog, setDialog] = useState<"provider" | "target" | "worker" | null>(null);
  const [plan, setPlan] = useState<string | null>(null);

  async function load() {
    const [providerBody, targetBody, workerBody, deploymentBody] = await Promise.all([
      request(props.token, "GET", `/api/projects/${props.projectId}/deployment-providers`),
      request(props.token, "GET", `/api/projects/${props.projectId}/deployment-targets`),
      request(props.token, "GET", `/api/projects/${props.projectId}/worker-definitions`),
      request(props.token, "GET", `/api/projects/${props.projectId}/deployments`),
    ]);
    const nextDeployments = (deploymentBody.deployments ?? []) as DeploymentRow[];
    setProviders((providerBody.providers ?? []) as ProviderRow[]);
    setTargets((targetBody.targets ?? []) as TargetRow[]);
    setWorkers((workerBody.workers ?? []) as WorkerRow[]);
    setDeployments(nextDeployments);
    const listed = await Promise.all(nextDeployments.map(async (deployment) => {
      const body = await request(props.token, "GET", `/api/projects/${props.projectId}/deployments/${deployment.id}/instances`);
      return [deployment.id, (body.instances ?? []) as InstanceRow[]] as const;
    }));
    setInstances(Object.fromEntries(listed));
  }

  useEffect(() => {
    void load().catch((error: Error) => props.onError(error.message));
  }, [props.projectId, props.token]);

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Deployments</h2>
        <span>
          <button type="button" className="btn" onClick={() => setDialog("provider")}>New provider</button>
          <button type="button" className="btn" onClick={() => setDialog("target")}>New target</button>
          <button type="button" className="btn btn-primary" onClick={() => setDialog("worker")}>New worker</button>
        </span>
      </header>
      {plan ? <p>{plan}</p> : null}
      {providers.map((provider) => <p key={provider.name}>{provider.name} · {provider.type}</p>)}
      {targets.map((target) => <p key={target.name}>{target.name} · {target.providerName}{target.config.namespace ? ` · ${target.config.namespace}` : ""}</p>)}
      {workers.map((worker) => (
        <article key={worker.name} className="resource-card">
          <h3>{worker.name}</h3>
          <p>{worker.management === "external" ? "External" : "Managed"} · {worker.targetName ?? "no target"} · {worker.capabilities.join(", ")}</p>
          <p>{worker.scaling.minInstances ?? 0}–{worker.scaling.maxInstances ?? worker.scaling.minInstances ?? 1} instances · {worker.scaling.concurrency?.maxPerInstance ?? 1} concurrent tasks each</p>
          <button type="button" onClick={() => void showPlan(props, worker, setPlan, props.onError)}>Plan</button>
          <button type="button" onClick={() => void deploy(props, worker, load, props.onError)}>Deploy</button>
        </article>
      ))}
      {deployments.map((deployment) => (
        <article key={deployment.id} className="resource-card">
          <h3>{deployment.workerName}</h3>
          <p>{deployment.status} · {deployment.providerType} · {deployment.targetName}</p>
          {deployment.error ? <p>{deployment.error}</p> : null}
          {(instances[deployment.id] ?? []).map((instance) => (
            <p key={instance.id}>
              {instance.health}{instance.cpu ? ` · ${instance.cpu}` : ""}{instance.memory ? ` · ${instance.memory}` : ""}
              {instance.estimatedCost ? ` · ${instance.estimatedCost.amount} ${instance.estimatedCost.currency}${instance.estimatedCost.estimated ? " estimated" : ""}` : ""}
            </p>
          ))}
        </article>
      ))}
      {dialog ? (
        <DeploymentDialog
          kind={dialog}
          providers={providers}
          targets={targets}
          onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            const path = dialog === "provider" ? "deployment-providers" : dialog === "target" ? "deployment-targets" : "worker-definitions";
            await request(props.token, "POST", `/api/projects/${props.projectId}/${path}`, body);
            setDialog(null);
            await load();
          }}
          onError={props.onError}
        />
      ) : null}
    </section>
  );
}

function DeploymentDialog(props: {
  kind: "provider" | "target" | "worker";
  providers: ProviderRow[];
  targets: TargetRow[];
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  onError: (message: string) => void;
}) {
  const title = props.kind === "provider" ? "New provider" : props.kind === "target" ? "New target" : "New worker";
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <form
        className="modal"
        role="dialog"
        aria-labelledby="deployment-dialog-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void props.onSubmit(bodyFrom(props.kind, data)).catch((error: Error) => props.onError(error.message));
        }}
      >
        <h2 id="deployment-dialog-title">{title}</h2>
        <label>Name<input name="name" required /></label>
        {props.kind === "provider" ? (
          <>
            <label>Type
              <select name="type" defaultValue="kubernetes"><option value="kubernetes">Kubernetes</option><option value="cloudflare">Cloudflare</option></select>
            </label>
            <label>Credential secret<input name="secret" placeholder="prod-kubeconfig" required /></label>
          </>
        ) : null}
        {props.kind === "target" ? (
          <>
            <label>Provider
              <select name="provider">{props.providers.map((provider) => <option key={provider.name}>{provider.name}</option>)}</select>
            </label>
            <label>Namespace<input name="namespace" placeholder="drassos-prod" /></label>
          </>
        ) : null}
        {props.kind === "worker" ? (
          <>
            <label>Image<input name="image" placeholder="ghcr.io/example/worker:1.0.0" /></label>
            <label>Runtime
              <select name="runtime" defaultValue="container"><option value="container">Container</option><option value="worker">Worker script</option></select>
            </label>
            <label>Capabilities<input name="capabilities" placeholder="postgres.query" /></label>
            <label>Minimum instances<input name="minInstances" type="number" defaultValue="1" /></label>
            <label>Maximum instances<input name="maxInstances" type="number" defaultValue="20" /></label>
            <label>Concurrent tasks per instance<input name="concurrency" type="number" defaultValue="5" /></label>
            <label>Target
              <select name="target">{props.targets.map((target) => <option key={target.name}>{target.name}</option>)}</select>
            </label>
            <label>Management
              <select name="management" defaultValue="managed"><option value="managed">Managed</option><option value="external">External</option></select>
            </label>
          </>
        ) : null}
        <button type="submit" className="btn btn-primary">Save</button>
        <button type="button" onClick={props.onClose}>Cancel</button>
      </form>
    </div>
  );
}

function bodyFrom(kind: "provider" | "target" | "worker", data: FormData): Record<string, unknown> {
  const name = String(data.get("name") ?? "");
  if (kind === "provider") {
    const type = String(data.get("type") ?? "kubernetes");
    const secret = String(data.get("secret") ?? "");
    return type === "cloudflare"
      ? { name, type, config: { accountId: { secret }, apiToken: { secret } } }
      : { name, type, config: { credentials: { secret } } };
  }
  if (kind === "target") {
    return { name, provider: String(data.get("provider") ?? ""), config: { namespace: String(data.get("namespace") ?? "") } };
  }
  const capabilities = String(data.get("capabilities") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const scaling = { mode: "provider" as const, minInstances: Number(data.get("minInstances") ?? 1), maxInstances: Number(data.get("maxInstances") ?? 1), concurrency: { maxPerInstance: Number(data.get("concurrency") ?? 1) } };
  return {
    name,
    management: String(data.get("management") ?? "managed"),
    target: String(data.get("target") ?? ""),
    capabilities,
    scaling,
    workload: { name, runtime: { type: String(data.get("runtime") ?? "container"), image: String(data.get("image") ?? "") }, scaling },
  };
}

async function showPlan(props: { token: string; projectId: string }, worker: WorkerRow, setPlan: (value: string) => void, onError: (message: string) => void) {
  try {
    const body = await request(props.token, "POST", `/api/projects/${props.projectId}/deployments/plan`, { worker: worker.name, target: worker.targetName });
    const actions = (body.actions ?? []) as Array<{ action: string; kind: string; name: string }>;
    setPlan(actions.map((action) => `${action.action} ${action.kind} ${action.name}`).join(", "));
  } catch (error) {
    onError(error instanceof Error ? error.message : "Plan failed");
  }
}

async function deploy(props: { token: string; projectId: string }, worker: WorkerRow, load: () => Promise<void>, onError: (message: string) => void) {
  try {
    await request(props.token, "POST", `/api/projects/${props.projectId}/deployments`, { worker: worker.name, target: worker.targetName });
    await load();
  } catch (error) {
    onError(error instanceof Error ? error.message : "Deploy failed");
  }
}

async function request(token: string, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json() as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Deployment request failed");
  }
  return payload;
}
