import { useMemo, useState } from "react";
import { formatCost, formatTokenCount, projectExecution, type CostSummary, type ExecutionProjection, type WorkflowDefinition } from "@drassos/designer-model";
import { Canvas } from "@drassos/designer-ui";

export interface UsageReport {
  cost: CostSummary;
  tokens: { input: number; output: number; total: number };
  events: Array<{
    id: string;
    stepName: string | null;
    attempt: number;
    type: string;
    provider: string | null;
    model: string | null;
    cost: { amount: string; currency: string } | null;
    metadata?: { inputTokens?: number; outputTokens?: number };
  }>;
  nodes: Record<string, { cost: CostSummary; tokens: { input: number; output: number; total: number }; events: UsageReport["events"] }>;
}

export function RunView(props: {
  definition: WorkflowDefinition;
  detail: {
    run: { id: string; status: string; workflowVersion: string; output: unknown; error: { name?: string; message?: string } | null; startedAt?: string | null; completedAt?: string | null };
    steps: Array<{ name: string; status: string; attempt: number; input: unknown; output: unknown; error: { name?: string; message?: string } | null; startedAt: string | null; completedAt: string | null }>;
    history: Array<{ seq: number; type: string; timestamp: string; payload: unknown }>;
  };
  usage: UsageReport;
  resources?: Array<{ resourceKey: string; accessMode: string; operation: string | null; outcome: string }>;
  packageDigest?: string | null;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const execution = useMemo(
    () =>
      projectExecution({
        executionId: props.detail.run.id,
        workflowId: props.definition.id,
        workflowVersion: props.detail.run.workflowVersion,
        status: props.detail.run.status,
        output: props.detail.run.output,
        error: props.detail.run.error,
        nodeIds: props.definition.nodes.map((node) => node.id),
        steps: props.detail.steps,
        history: props.detail.history,
      }),
    [props.definition, props.detail],
  );
  const selected = selectedNodeId ? props.definition.nodes.find((node) => node.id === selectedNodeId) : undefined;
  const selectedRun = selectedNodeId ? execution.nodes[selectedNodeId] : undefined;
  const selectedUsage = selectedNodeId ? props.usage.nodes[selectedNodeId] : undefined;
  const annotations = Object.fromEntries(
    props.definition.nodes.map((node) => {
      const view = execution.nodes[node.id];
      const usage = props.usage.nodes[node.id];
      return [
        node.id,
        {
          duration: view?.durationMs != null ? `${(view.durationMs / 1000).toFixed(2)}s` : undefined,
          tokens: usage && usage.tokens.total > 0 ? formatTokenCount(usage.tokens.total) : undefined,
          cost: usage ? formatCost(usage.cost) : undefined,
        },
      ];
    }),
  );
  return (
    <section className="run-view designer-host">
      <header className="run-summary">
        <h1>Run {props.detail.run.id}</h1>
        <p>Status: {props.detail.run.status}</p>
        <p>Version: {props.detail.run.workflowVersion}</p>
        {props.packageDigest ? <p>Package {props.packageDigest.slice(0, 12)}</p> : null}
        <p>Cost: {formatCost(props.usage.cost)}</p>
        <p>AI tokens: {props.usage.tokens.total.toLocaleString("en-US")}</p>
        {(props.resources ?? []).map((access) => (
          <p key={`${access.resourceKey}-${access.accessMode}-${access.operation}`}>
            {access.resourceKey} · {access.accessMode} · {access.operation ?? "handoff"} · {access.outcome}
            {access.accessMode === "direct" ? " · Direct Access does not record individual SQL statements." : ""}
          </p>
        ))}
      </header>
      <ul className="run-nodes">
        {props.definition.nodes.map((node) => (
          <li key={node.id}>
            <button type="button" onClick={() => setSelectedNodeId(node.id)}>
              {node.name ?? node.id} {execution.nodes[node.id]?.status ?? "not-started"} {annotations[node.id]?.cost ?? ""}
            </button>
          </li>
        ))}
      </ul>
      <div className="run-layout">
        <Canvas
          definition={props.definition}
          diagnostics={[]}
          statuses={statusesOf(execution)}
          annotations={annotations}
          onSelectNode={setSelectedNodeId}
          onSelectEdge={() => undefined}
          onMove={() => undefined}
          onConnect={() => undefined}
          onDeleteNode={() => undefined}
          onDeleteEdge={() => undefined}
          onAddNode={() => undefined}
        />
        <aside className="properties">
          {selected && selectedRun ? (
            <NodeInspector nodeName={selected.name ?? selected.id} nodeType={selected.type} run={selectedRun} usage={selectedUsage} />
          ) : (
            <p>Select a node to inspect its execution.</p>
          )}
        </aside>
      </div>
    </section>
  );
}

function NodeInspector(props: {
  nodeName: string;
  nodeType: string;
  run: ExecutionProjection["nodes"][string];
  usage?: UsageReport["nodes"][string];
}) {
  return (
    <div>
      <h2>{props.nodeName}</h2>
      <p>Type: {props.nodeType}</p>
      <p>Status: {props.run.status}</p>
      <p>Attempts: {props.run.attempts}</p>
      <p>Duration: {props.run.durationMs == null ? "Unavailable" : `${props.run.durationMs} ms`}</p>
      <p>Worker: {props.run.workerId ?? "Unavailable"}</p>
      <p>Cost: {props.usage ? formatCost(props.usage.cost) : "Unavailable"}</p>
      {props.run.error ? <p>Error: {props.run.error.name}: {props.run.error.message}</p> : null}
      <h3>Input</h3>
      <ValueView value={props.run.input} />
      <h3>Output</h3>
      <ValueView value={props.run.output} />
      <h3>Logs</h3>
      {(props.run.logs ?? []).length === 0 ? <p>No logs.</p> : (props.run.logs ?? []).map((log) => <p key={`${log.timestamp}-${log.message}`}>{log.level ?? "info"}: {log.message}</p>)}
      <h3>Attempts</h3>
      {(props.usage?.events ?? []).length === 0 ? <p>No usage events.</p> : props.usage?.events.map((event) => (
        <p key={event.id}>
          Attempt {event.attempt} {event.type} {event.provider ?? ""} {event.model ?? ""} {event.cost ? formatCost({ state: "complete", amount: event.cost.amount, currency: event.cost.currency }) : "Unavailable"}
        </p>
      ))}
      {props.usage ? (
        <>
          <h3>Usage</h3>
          <p>Input tokens: {props.usage.tokens.input}</p>
          <p>Output tokens: {props.usage.tokens.output}</p>
          <p>Total tokens: {props.usage.tokens.total}</p>
        </>
      ) : null}
    </div>
  );
}

function ValueView(props: { value: unknown }) {
  if (props.value === undefined) {
    return <p>No output</p>;
  }
  if (props.value === null) {
    return <p>null</p>;
  }
  return <pre>{JSON.stringify(props.value, null, 2)}</pre>;
}

function statusesOf(execution: ExecutionProjection) {
  return Object.fromEntries(Object.entries(execution.nodes).map(([id, node]) => [id, node.status]));
}
