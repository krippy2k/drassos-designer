import { useEffect, useState } from "react";

interface SecretOption {
  id: string;
  name: string;
}

interface ResourceView {
  key: string;
  bindings: Array<{ environment: string; host: string; database: string; username: string; secretName: string | null; policy: { action: boolean; client: boolean; direct: boolean } }>;
  actions: Array<{ name: string; sql: string }>;
}

export function Resources(props: { token: string; projectId: string; onError: (message: string | null) => void }) {
  const [resources, setResources] = useState<ResourceView[]>([]);
  const [secrets, setSecrets] = useState<SecretOption[]>([]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    return Promise.all([
      api(props.token, "GET", `/api/projects/${props.projectId}/resources`),
      api(props.token, "GET", `/api/projects/${props.projectId}/secrets`),
    ]).then(([resourceBody, secretBody]) => {
      setResources((resourceBody.resources as ResourceView[]) ?? []);
      setSecrets((secretBody.secrets as SecretOption[]) ?? []);
    });
  }

  useEffect(() => {
    void load().catch((error: Error) => props.onError(error.message));
  }, [props.projectId, props.token]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Resources</h2>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>New resource</button>
      </div>
      <p className="muted">PostgreSQL connections stay with the project. Workflows use the resource key, not a host or password.</p>
      {message ? <p className="banner">{message}</p> : null}
      {resources.length === 0 ? <p className="muted">No resources yet.</p> : null}
      <ul className="card-list">
        {resources.map((resource) => (
          <li key={resource.key}>
            <article className="resource-card">
              <strong>{resource.key}</strong>
              <span>PostgreSQL</span>
              {resource.bindings.map((binding) => (
                <p key={binding.environment}>
                  {binding.environment}: {binding.host} / {binding.database} as {binding.username}
                  {" · "}secret {binding.secretName ?? "missing"}
                  {" · "}action {binding.policy.action ? "allowed" : "denied"}
                  {" · "}client {binding.policy.client ? "allowed" : "denied"}
                  {" · "}direct {binding.policy.direct ? "allowed" : "denied"}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      void api(props.token, "POST", `/api/projects/${props.projectId}/resources/${resource.key}/test`, { environment: binding.environment })
                        .then(() => setMessage(`${resource.key} connected in ${binding.environment}.`))
                        .catch((error: Error) => setMessage(error.message));
                    }}
                  >
                    Test {binding.environment}
                  </button>
                </p>
              ))}
              {resource.actions.map((action) => <p key={action.name}>{action.name}</p>)}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  void api(props.token, "DELETE", `/api/projects/${props.projectId}/resources/${resource.key}`)
                    .then(() => load())
                    .catch((error: Error) => setMessage(error.message));
                }}
              >
                Delete {resource.key}
              </button>
            </article>
          </li>
        ))}
      </ul>
      {open ? (
        <ResourceDialog
          secrets={secrets}
          onClose={() => setOpen(false)}
          onCreate={async (body) => {
            if (body.secret.value) {
              const created = await api(props.token, "POST", `/api/projects/${props.projectId}/secrets`, body.secret) as { id: string; name: string };
              body.bindings.forEach((binding) => {
                binding.config.secretId = created.id;
              });
            }
            await api(props.token, "POST", `/api/projects/${props.projectId}/resources`, { key: body.key, bindings: body.bindings });
            if (body.action.name && body.action.sql) {
              await api(props.token, "POST", `/api/projects/${props.projectId}/resources/${body.key}/actions`, body.action);
            }
            await load();
            setOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

function ResourceDialog(props: {
  secrets: SecretOption[];
  onClose: () => void;
  onCreate: (body: {
    key: string;
    secret: { name: string; value: string };
    bindings: Array<{ environment: string; config: Record<string, unknown>; policy: { action: boolean; client: boolean; direct: boolean } }>;
    action: { name: string; kind: "query"; sql: string; inputs: Array<{ name: string; type: string }> };
  }) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        role="dialog"
        aria-labelledby="resource-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const secretId = String(data.get("secretId") ?? "");
          const bindings = ["development", "production"].map((environment) => ({
            environment,
            config: {
              host: String(data.get(`${environment}-host`) ?? ""),
              port: Number(data.get(`${environment}-port`) ?? 5432),
              database: String(data.get(`${environment}-database`) ?? ""),
              username: String(data.get(`${environment}-username`) ?? ""),
              secretId,
            },
            policy: {
              action: data.get(`${environment}-action`) === "on",
              client: data.get(`${environment}-client`) === "on",
              direct: data.get(`${environment}-direct`) === "on",
            },
          }));
          const inputNames = String(data.get("inputs") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
          void props.onCreate({
            key: String(data.get("key") ?? ""),
            secret: { name: String(data.get("secretName") ?? ""), value: String(data.get("secretValue") ?? "") },
            bindings,
            action: {
              name: String(data.get("actionName") ?? ""),
              kind: "query",
              sql: String(data.get("sql") ?? ""),
              inputs: inputNames.map((name) => ({ name, type: "string" })),
            },
          }).catch((failure: Error) => setError(failure.message));
        }}
      >
        <h2 id="resource-dialog-title">New PostgreSQL resource</h2>
        <p>Configure development and production separately. The password is stored as a secret and is not written into the workflow.</p>
        <label>Key<input name="key" required placeholder="customer-db" /></label>
        <label>
          Existing secret
          <select name="secretId" aria-label="Existing secret">
            <option value="">Create a new secret</option>
            {props.secrets.map((secret) => <option key={secret.id} value={secret.id}>{secret.name}</option>)}
          </select>
        </label>
        <label>New secret name<input name="secretName" aria-label="New secret name" /></label>
        <label>New secret value<input name="secretValue" aria-label="New secret value" type="password" /></label>
        {["development", "production"].map((environment) => (
          <fieldset key={environment}>
            <legend>{environment}</legend>
            <label>Host<input name={`${environment}-host`} required /></label>
            <label>Port<input name={`${environment}-port`} defaultValue="5432" /></label>
            <label>Database<input name={`${environment}-database`} required /></label>
            <label>Username<input name={`${environment}-username`} required /></label>
            <label><input name={`${environment}-action`} type="checkbox" value="on" defaultChecked /> Action Access</label>
            <label><input name={`${environment}-client`} type="checkbox" value="on" defaultChecked /> Client Access</label>
            <label><input name={`${environment}-direct`} type="checkbox" value="on" /> Direct Access</label>
          </fieldset>
        ))}
        <label>Action name<input name="actionName" placeholder="find-user-by-email" /></label>
        <label>SQL<textarea name="sql" placeholder="SELECT id FROM users WHERE email = $1" /></label>
        <label>Input names<input name="inputs" placeholder="email" /></label>
        {error ? <p className="banner">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={props.onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Create resource</button>
        </div>
      </form>
    </div>
  );
}

async function api(token: string, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const record = payload as { error?: { message?: string } };
    throw new Error(record.error?.message ?? "Designer request failed");
  }
  return payload as Record<string, unknown>;
}
