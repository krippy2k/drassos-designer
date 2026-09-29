import type { DesignerExecutionEvent, ExecutionProjection, NodeExecutionView, WorkflowDiagnostic } from "@drassos/designer-model";

export function BottomPanel(props: {
  tab: "problems" | "execution" | "events" | "output";
  onTab: (tab: "problems" | "execution" | "events" | "output") => void;
  diagnostics: WorkflowDiagnostic[];
  execution: ExecutionProjection | null;
  selectedNodeId?: string;
  onSelectDiagnostic: (diagnostic: WorkflowDiagnostic) => void;
  onSelectEvent: (event: DesignerExecutionEvent) => void;
}) {
  const selected = props.selectedNodeId ? props.execution?.nodes[props.selectedNodeId] : undefined;
  return (
    <section className="bottom">
      <div role="tablist">
        {(["problems", "execution", "events", "output"] as const).map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={props.tab === tab} onClick={() => props.onTab(tab)}>
            {tab}
          </button>
        ))}
      </div>
      {props.tab === "problems" ? <Problems diagnostics={props.diagnostics} onSelect={props.onSelectDiagnostic} /> : null}
      {props.tab === "execution" ? <Inspector node={selected} /> : null}
      {props.tab === "events" ? <Timeline events={props.execution?.events ?? []} onSelect={props.onSelectEvent} /> : null}
      {props.tab === "output" ? <Output execution={props.execution} /> : null}
    </section>
  );
}

export function Problems(props: { diagnostics: WorkflowDiagnostic[]; onSelect: (diagnostic: WorkflowDiagnostic) => void }) {
  return (
    <ul className="problems">
      {props.diagnostics.length === 0 ? <li>No problems</li> : null}
      {props.diagnostics.map((diagnostic, index) => (
        <li key={`${diagnostic.code}-${diagnostic.nodeId ?? diagnostic.edgeId ?? index}`}>
          <button type="button" onClick={() => props.onSelect(diagnostic)}>
            <span>{diagnostic.severity === "error" ? "✕" : "⚠"}</span>
            <strong>{diagnostic.nodeId ?? diagnostic.edgeId ?? diagnostic.code}</strong>
            <span>{diagnostic.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Timeline(props: { events: DesignerExecutionEvent[]; onSelect: (event: DesignerExecutionEvent) => void }) {
  return (
    <ol className="timeline">
      {props.events.map((event) => (
        <li key={event.seq}>
          <button type="button" onClick={() => props.onSelect(event)}>
            <time>{event.timestamp.slice(11, 23)}</time>
            <span>{event.type}</span>
            {event.nodeId ? <code>{event.nodeId}</code> : null}
          </button>
        </li>
      ))}
    </ol>
  );
}

export function Inspector(props: { node?: NodeExecutionView }) {
  if (!props.node) {
    return <p>Select a node to inspect its execution.</p>;
  }
  return (
    <div className="inspector">
      <p>Status: {props.node.status}</p>
      <p>Attempts: {props.node.attempts}</p>
      <p>Duration: {props.node.durationMs == null ? "—" : `${props.node.durationMs} ms`}</p>
      <h3>Input</h3>
      <pre>{JSON.stringify(props.node.input, null, 2)}</pre>
      <h3>Output</h3>
      <pre>{JSON.stringify(props.node.output, null, 2)}</pre>
      {props.node.error ? (
        <>
          <h3>Error</h3>
          <p>
            {props.node.error.name}: {props.node.error.message}
          </p>
        </>
      ) : null}
      {props.node.workerId ? <p>Worker: {props.node.workerId}</p> : null}
      {props.node.capability ? <p>Capability: {props.node.capability}</p> : null}
      {props.node.logs && props.node.logs.length > 0 ? (
        <>
          <h3>Logs</h3>
          <ul>
            {props.node.logs.map((entry, index) => (
              <li key={`${entry.timestamp}-${index}`}>
                {entry.level ?? "info"}: {entry.message}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export function Output(props: { execution: ExecutionProjection | null }) {
  if (!props.execution) {
    return <p>Run a workflow to see its output.</p>;
  }
  if (props.execution.error) {
    return (
      <div>
        <h3>Failed</h3>
        <p>
          {props.execution.error.name}: {props.execution.error.message}
        </p>
      </div>
    );
  }
  return <pre>{JSON.stringify(props.execution.output, null, 2)}</pre>;
}

export function RunDialog(props: {
  fields: Array<{ name: string; type?: string }>;
  onCancel: () => void;
  onRun: (input: Record<string, unknown>, environment: string) => void;
}) {
  return (
    <form
      className="dialog"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const input: Record<string, unknown> = {};
        for (const field of props.fields) {
          const raw = String(data.get(field.name) ?? "");
          input[field.name] = field.type === "number" ? Number(raw) : field.type === "boolean" ? raw === "true" : raw;
        }
        props.onRun(input, String(data.get("environment") ?? "development"));
      }}
    >
      <h2>Run workflow</h2>
      <label>
        Environment
        <select name="environment" aria-label="Environment" defaultValue="development">
          <option value="development">development</option>
          <option value="production">production</option>
        </select>
      </label>
      {props.fields.length === 0 ? <p>This workflow has no declared inputs.</p> : null}
      {props.fields.map((field) => (
        <label key={field.name}>
          {field.name}
          <input name={field.name} />
        </label>
      ))}
      <div>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="submit">Run</button>
      </div>
    </form>
  );
}

export function CreateDialog(props: { onCancel: () => void; onCreate: (value: { name: string; id: string; version: string; description: string }) => void }) {
  return (
    <form
      className="dialog"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        props.onCreate({
          name: String(data.get("name") ?? ""),
          id: String(data.get("id") ?? ""),
          version: String(data.get("version") ?? "1.0.0"),
          description: String(data.get("description") ?? ""),
        });
      }}
    >
      <h2>New workflow</h2>
      <label>
        Name
        <input name="name" required />
      </label>
      <label>
        Workflow ID
        <input name="id" required />
      </label>
      <label>
        Version
        <input name="version" defaultValue="1.0.0" required />
      </label>
      <label>
        Description
        <input name="description" />
      </label>
      <div>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="submit">Create</button>
      </div>
    </form>
  );
}
