import { useState } from "react";
import {
  contractOf,
  contractTypeSource,
  defaultInlineSource,
  extractInlineActivity,
  implementationKind,
  type ActivityImplementationKind,
  type ActivityTestRequest,
  type ActivityTestResult,
  type CapabilityDescriptor,
  type ComparisonExpression,
  type ValueReference,
  type ValueSchema,
  type WorkflowDefinition,
  type WorkflowNode,
} from "@drassos/designer-model";
import { SchemaList } from "./SchemaList.tsx";

function forwardSchema(
  onSchema: (kind: "inputs" | "outputs", name: string, schema: ValueSchema | null, previousName?: string) => void,
  kind: "inputs" | "outputs",
  name: string,
  schema: ValueSchema | null,
  previousName?: string,
): void {
  if (previousName) {
    onSchema(kind, name, schema, previousName);
    return;
  }
  onSchema(kind, name, schema);
}

export interface DesignerResourceOption {
  key: string;
  actions: Array<{ name: string; inputs: Array<{ name: string }> }>;
}

export function Properties(props: {
  definition: WorkflowDefinition | null;
  node: WorkflowNode | null;
  activities: CapabilityDescriptor[];
  agents: CapabilityDescriptor[];
  workflows: CapabilityDescriptor[];
  resources?: DesignerResourceOption[];
  onWorkflow: (patch: { name?: string; description?: string; version?: string }) => void;
  onSchema: (kind: "inputs" | "outputs", name: string, schema: ValueSchema | null, previousName?: string) => void;
  onNode: (nodeId: string, patch: { name?: string; config?: Record<string, unknown> }) => void;
  onMapping: (nodeId: string, field: string, reference: ValueReference | null) => void;
  onCondition: (nodeId: string, expression: ComparisonExpression) => void;
  testActivity?: (request: ActivityTestRequest) => Promise<ActivityTestResult>;
}) {
  if (!props.definition) {
    return <aside className="properties"><p>Open a workflow to edit it.</p></aside>;
  }
  if (!props.node) {
    return (
      <aside className="properties">
        <h2>Workflow</h2>
        <label>
          Name
          <input value={props.definition.name} onChange={(event) => props.onWorkflow({ name: event.target.value })} />
        </label>
        <label>
          ID
          <input value={props.definition.id} readOnly />
        </label>
        <label>
          Version
          <input value={props.definition.version} onChange={(event) => props.onWorkflow({ version: event.target.value })} />
        </label>
        <label>
          Description
          <input value={props.definition.description ?? ""} onChange={(event) => props.onWorkflow({ description: event.target.value })} />
        </label>
        <SchemaList title="Inputs" fields={props.definition.inputs ?? {}} onChange={(name, schema, previousName) => forwardSchema(props.onSchema, "inputs", name, schema, previousName)} />
        <SchemaList title="Outputs" fields={props.definition.outputs ?? {}} onChange={(name, schema, previousName) => forwardSchema(props.onSchema, "outputs", name, schema, previousName)} />
      </aside>
    );
  }
  const node = props.node;
  return (
    <aside className="properties">
      <h2>{node.type}</h2>
      <label>
        Name
        <input value={node.name ?? ""} onChange={(event) => props.onNode(node.id, { name: event.target.value })} />
      </label>
      <label>
        Node ID
        <input value={node.id} readOnly />
      </label>
      <label>
        Type
        <input value={node.type} readOnly />
      </label>
      {node.type === "activity" ? (
        <CapabilitySelect
          label="Implementation"
          value={String(node.config.activity ?? "")}
          options={props.activities}
          onChange={(activity) => props.onNode(node.id, { config: { activity, capability: activity } })}
        />
      ) : null}
      {node.type === "activity" ? (
        <ActivityDevelopment node={node} onNode={props.onNode} testActivity={props.testActivity} />
      ) : null}
      {node.type === "agent" ? (
        <CapabilitySelect
          label="Agent"
          value={String(node.config.agent ?? "")}
          options={props.agents}
          onChange={(agent) => props.onNode(node.id, { config: { agent } })}
        />
      ) : null}
      {node.type === "child-workflow" ? (
        <CapabilitySelect
          label="Workflow"
          value={String(node.config.workflow ?? "")}
          options={props.workflows}
          onChange={(workflow) => props.onNode(node.id, { config: { workflow } })}
        />
      ) : null}
      {node.type === "signal" ? (
        <label>
          Signal
          <input value={String(node.config.signal ?? "")} onChange={(event) => props.onNode(node.id, { config: { signal: event.target.value } })} />
        </label>
      ) : null}
      {node.type === "wait" ? (
        <label>
          Duration
          <input value={String(node.config.duration ?? "")} onChange={(event) => props.onNode(node.id, { config: { duration: event.target.value } })} />
        </label>
      ) : null}
      {node.type === "resource" ? (
        <ResourceActionFields
          node={node}
          resources={props.resources ?? []}
          onNode={props.onNode}
        />
      ) : null}
      {node.type === "activity" ? (
        <ActivityResources node={node} resources={props.resources ?? []} onNode={props.onNode} />
      ) : null}
      {node.type === "resource" || node.type === "activity" || node.type === "agent" || node.type === "child-workflow" ? (
        <MappingEditor node={node} definition={props.definition} onMapping={props.onMapping} />
      ) : null}
      {node.type === "condition" ? (
        <ConditionEditor node={node} definition={props.definition} onCondition={props.onCondition} />
      ) : null}
      {node.type === "activity" || node.type === "agent" ? (
        <RetryTimeout node={node} onNode={props.onNode} />
      ) : null}
    </aside>
  );
}

function ResourceActionFields(props: {
  node: WorkflowNode;
  resources: DesignerResourceOption[];
  onNode: (nodeId: string, patch: { config?: Record<string, unknown> }) => void;
}) {
  const resourceKey = String(props.node.config.resource ?? "");
  const actionName = String(props.node.config.action ?? "");
  const selected = props.resources.find((resource) => resource.key === resourceKey);
  const actions = [{ name: "query" }, { name: "execute" }, ...(selected?.actions ?? [])];
  return (
    <>
      <label>
        Resource
        <select
          aria-label="Resource"
          value={resourceKey}
          onChange={(event) => props.onNode(props.node.id, { config: { ...props.node.config, resource: event.target.value } })}
        >
          <option value="">Select</option>
          {props.resources.map((resource) => (
            <option key={resource.key} value={resource.key}>{resource.key}</option>
          ))}
        </select>
      </label>
      <label>
        Action
        <select
          aria-label="Action"
          value={actionName}
          onChange={(event) => props.onNode(props.node.id, { config: { ...props.node.config, action: event.target.value } })}
        >
          <option value="">Select</option>
          {actions.map((action) => (
            <option key={action.name} value={action.name}>{action.name}</option>
          ))}
        </select>
      </label>
    </>
  );
}

function ActivityResources(props: {
  node: WorkflowNode;
  resources: DesignerResourceOption[];
  onNode: (nodeId: string, patch: { config?: Record<string, unknown> }) => void;
}) {
  const requirements = Array.isArray(props.node.config.resources) ? props.node.config.resources as Array<{ key?: string; access?: string }> : [];
  const direct = requirements.some((item) => item.access === "direct");
  return (
    <div>
      <h3>Resources</h3>
      {requirements.map((item, index) => (
        <p key={`${item.key}-${index}`}>{item.key} · {item.access}</p>
      ))}
      {direct ? <p className="banner">Direct Access gives the worker the database connection. Drassos will not record individual SQL statements.</p> : null}
      <label>
        Required resource
        <select aria-label="Required resource" id={`${props.node.id}-resource`} defaultValue="">
          <option value="">Select</option>
          {props.resources.map((resource) => (
            <option key={resource.key} value={resource.key}>{resource.key}</option>
          ))}
        </select>
      </label>
      <label>
        Access
        <select aria-label="Resource access" id={`${props.node.id}-access`} defaultValue="client">
          <option value="client">Client Access</option>
          <option value="direct">Direct Access</option>
        </select>
      </label>
      <button
        type="button"
        onClick={() => {
          const key = (document.getElementById(`${props.node.id}-resource`) as HTMLSelectElement | null)?.value ?? "";
          const access = (document.getElementById(`${props.node.id}-access`) as HTMLSelectElement | null)?.value ?? "client";
          if (!key) {
            return;
          }
          props.onNode(props.node.id, { config: { ...props.node.config, resources: [...requirements, { key, access }] } });
        }}
      >
        Add resource
      </button>
    </div>
  );
}

function CapabilitySelect(props: { label: string; value: string; options: CapabilityDescriptor[]; onChange: (value: string) => void }) {
  return (
    <label>
      {props.label}
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">Select</option>
        {props.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name ?? option.id}
          </option>
        ))}
      </select>
      {props.options.find((option) => option.id === props.value)?.description ? (
        <small>{props.options.find((option) => option.id === props.value)?.description}</small>
      ) : null}
    </label>
  );
}

function MappingEditor(props: {
  node: WorkflowNode;
  definition: WorkflowDefinition;
  onMapping: (nodeId: string, field: string, reference: ValueReference | null) => void;
}) {
  const input = (props.node.config.input ?? {}) as Record<string, ValueReference>;
  return (
    <div>
      <h3>Input mapping</h3>
      {Object.entries(input).map(([field, reference]) => (
        <MappingRow key={field} field={field} reference={reference} definition={props.definition} onChange={(next) => props.onMapping(props.node.id, field, next)} />
      ))}
      <button
        type="button"
        onClick={() => {
          const field = window.prompt("Input field");
          if (field) {
            props.onMapping(props.node.id, field, { source: "input", path: field });
          }
        }}
      >
        Add mapping
      </button>
    </div>
  );
}

function MappingRow(props: {
  field: string;
  reference: ValueReference;
  definition: WorkflowDefinition;
  onChange: (reference: ValueReference | null) => void;
}) {
  const source = props.reference.source;
  return (
    <fieldset>
      <legend>{props.field}</legend>
      <select
        aria-label={`${props.field} source`}
        value={source}
        onChange={(event) => props.onChange(referenceFor(event.target.value, props.field, props.definition))}
      >
        <option value="input">Workflow input</option>
        <option value="node">Node output</option>
        <option value="state">Workflow state</option>
        <option value="literal">Literal value</option>
      </select>
      {props.reference.source === "node" ? (
        <select
          aria-label={`${props.field} node`}
          value={props.reference.nodeId}
          onChange={(event) => {
            const path = props.reference.source === "node" ? props.reference.path : undefined;
            props.onChange({ source: "node", nodeId: event.target.value, path });
          }}
        >
          {props.definition.nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.name ?? node.id}
            </option>
          ))}
        </select>
      ) : null}
      {props.reference.source !== "literal" ? (
        <input
          aria-label={`${props.field} path`}
          value={"path" in props.reference ? (props.reference.path ?? "") : ""}
          onChange={(event) => {
            if (props.reference.source === "node") {
              props.onChange({ ...props.reference, path: event.target.value });
            } else if (props.reference.source === "input" || props.reference.source === "state") {
              props.onChange({ source: props.reference.source, path: event.target.value });
            }
          }}
        />
      ) : (
        <input
          aria-label={`${props.field} literal`}
          value={String(props.reference.value ?? "")}
          onChange={(event) => props.onChange({ source: "literal", value: parseLiteral(event.target.value) })}
        />
      )}
      <button type="button" onClick={() => props.onChange(null)}>
        Remove
      </button>
    </fieldset>
  );
}

function ConditionEditor(props: {
  node: WorkflowNode;
  definition: WorkflowDefinition;
  onCondition: (nodeId: string, expression: ComparisonExpression) => void;
}) {
  const expression = (props.node.config.expression ?? {
    type: "comparison",
    operator: "eq",
    left: { source: "literal", value: true },
    right: { source: "literal", value: true },
  }) as ComparisonExpression;
  return (
    <div>
      <h3>Condition</h3>
      <MappingRow field="left" reference={expression.left} definition={props.definition} onChange={(reference) => reference && props.onCondition(props.node.id, { ...expression, left: reference })} />
      <label>
        Operator
        <select
          value={expression.operator}
          onChange={(event) => props.onCondition(props.node.id, { ...expression, operator: event.target.value as ComparisonExpression["operator"] })}
        >
          <option value="eq">equals</option>
          <option value="neq">not equals</option>
          <option value="gt">greater than</option>
          <option value="gte">greater or equal</option>
          <option value="lt">less than</option>
          <option value="lte">less or equal</option>
        </select>
      </label>
      <MappingRow field="right" reference={expression.right} definition={props.definition} onChange={(reference) => reference && props.onCondition(props.node.id, { ...expression, right: reference })} />
    </div>
  );
}

function ActivityDevelopment(props: {
  node: WorkflowNode;
  onNode: (nodeId: string, patch: { name?: string; config?: Record<string, unknown> }) => void;
  testActivity?: (request: ActivityTestRequest) => Promise<ActivityTestResult>;
}) {
  const kind = implementationKind(props.node);
  const implementation = props.node.config.implementation as { type?: string; source?: string; activityName?: string } | undefined;
  const contract = contractOf(props.node);
  const grants = (props.node.config.grants ?? {}) as { connectors?: string[]; secrets?: string[] };
  const [sample, setSample] = useState("{\n}\n");
  const [result, setResult] = useState<ActivityTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [sourceDraft, setSourceDraft] = useState<string | null>(null);
  const inline = kind === "inline-typescript" || kind === "inline-javascript";

  function choose(type: ActivityImplementationKind) {
    const activity = String(props.node.config.activity || props.node.id);
    if (type === "unimplemented") {
      props.onNode(props.node.id, { config: { activity, implementation: { type: "unimplemented" } } });
      return;
    }
    if (type === "external") {
      const activityName = implementation?.activityName || activity;
      props.onNode(props.node.id, { config: { activity: activityName, capability: activityName, implementation: { type: "external", activityName } } });
      return;
    }
    const source = implementation?.type === type && implementation.source ? implementation.source : defaultInlineSource(type, activity);
    props.onNode(props.node.id, { config: { activity, implementation: { type, source } } });
  }

  return (
    <div>
      <label>
        Description
        <input
          aria-label="Activity description"
          value={String(props.node.config.description ?? "")}
          onChange={(event) => props.onNode(props.node.id, { config: { description: event.target.value } })}
        />
      </label>
      <fieldset>
        <legend>Implementation type</legend>
        {([
          ["unimplemented", "Not Implemented"],
          ["inline-typescript", "Inline TypeScript"],
          ["inline-javascript", "Inline JavaScript"],
          ["external", "External Activity"],
        ] as const).map(([type, label]) => (
          <label key={type}>
            <input type="radio" name={`${props.node.id}-implementation`} value={type} checked={kind === type} onChange={() => choose(type)} />
            {label}
          </label>
        ))}
      </fieldset>
      <SchemaList
        title="Inputs"
        fields={contract.input ?? {}}
        onChange={(name, schema, previousName) => {
          const input = { ...(contract.input ?? {}) };
          if (previousName && previousName !== name) {
            delete input[previousName];
          }
          if (schema) {
            input[name] = schema;
          } else {
            delete input[name];
          }
          props.onNode(props.node.id, { config: { contract: { ...contract, input } } });
        }}
      />
      <button
        type="button"
        disabled={Object.keys(contract.input ?? {}).length === 0}
        onClick={() => props.onNode(props.node.id, {
          config: {
            contract: {
              ...contract,
              output: { ...(contract.output ?? {}), ...structuredClone(contract.input ?? {}) },
            },
          },
        })}
      >
        Copy inputs to outputs
      </button>
      <SchemaList
        title="Outputs"
        fields={contract.output ?? {}}
        onChange={(name, schema, previousName) => {
          const output = { ...(contract.output ?? {}) };
          if (previousName && previousName !== name) {
            delete output[previousName];
          }
          if (schema) {
            output[name] = schema;
          } else {
            delete output[name];
          }
          props.onNode(props.node.id, { config: { contract: { ...contract, output } } });
        }}
      />
      {inline ? (
        <>
          <h3>Generated types</h3>
          <pre aria-label="Generated types">{contractTypeSource(contract)}</pre>
          <button type="button" onClick={() => setSourceDraft(implementation?.source ?? "")}>
            Edit source
          </button>
          {sourceDraft != null ? (
            <div className="dialog source-dialog" role="dialog" aria-label="Edit inline source">
              <h2>Inline source</h2>
              <textarea
                aria-label="Inline source"
                className="source"
                value={sourceDraft}
                onChange={(event) => setSourceDraft(event.target.value)}
              />
              <div>
                <button type="button" onClick={() => setSourceDraft(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    props.onNode(props.node.id, { config: { implementation: { type: kind, source: sourceDraft } } });
                    setSourceDraft(null);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const extracted = extractInlineActivity(props.node);
              props.onNode(props.node.id, { config: extracted.config });
              downloadText(extracted.path.split("/").pop() ?? "activity.ts", extracted.source);
            }}
          >
            Extract to external activity
          </button>
          <h3>Test</h3>
          <label>
            Sample input
            <textarea aria-label="Sample input" value={sample} onChange={(event) => setSample(event.target.value)} />
          </label>
          <button
            type="button"
            disabled={testing}
            onClick={() => {
              if (!props.testActivity) {
                setResult({ output: null, logs: [], durationMs: 0, error: { name: "Error", message: "Connect to a Drassos Engine before testing an activity." } });
                return;
              }
              let input: unknown = {};
              try {
                input = sample.trim() ? JSON.parse(sample) : {};
              } catch (error) {
                setResult({ output: null, logs: [], durationMs: 0, error: { name: "Error", message: error instanceof Error ? error.message : "Sample input is not JSON" } });
                return;
              }
              setTesting(true);
              void props.testActivity({
                language: kind,
                source: implementation?.source ?? "",
                input,
                activityId: String(props.node.config.activity || props.node.id),
                contract,
                grants,
              }).then(setResult).catch((error: Error) => {
                setResult({ output: null, logs: [], durationMs: 0, error: { name: "Error", message: error.message } });
              }).finally(() => setTesting(false));
            }}
          >
            Run activity
          </button>
          {result ? (
            <div>
              <p>Duration: {result.durationMs} ms</p>
              {result.error ? <p>{result.error.message}</p> : <pre aria-label="Activity output">{JSON.stringify(result.output, null, 2)}</pre>}
              {result.logs.map((entry, index) => <p key={`${entry.level}-${index}`}>{entry.level}: {entry.message}</p>)}
            </div>
          ) : null}
        </>
      ) : null}
      <label>
        Authorized connectors
        <input
          aria-label="Authorized connectors"
          value={(grants.connectors ?? []).join(", ")}
          onChange={(event) => {
            const connectors = event.target.value.split(",").map((item) => item.trim()).filter(Boolean);
            props.onNode(props.node.id, { config: { grants: { ...grants, connectors } } });
          }}
        />
      </label>
    </div>
  );
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function RetryTimeout(props: { node: WorkflowNode; onNode: (nodeId: string, patch: { config?: Record<string, unknown> }) => void }) {
  const retry = props.node.config.retry as { maxAttempts?: number } | undefined;
  return (
    <div>
      <h3>Retry</h3>
      <label>
        Attempts
        <input
          type="number"
          min={1}
          value={retry?.maxAttempts ?? 1}
          onChange={(event) =>
            props.onNode(props.node.id, {
              config: { retry: { maxAttempts: Number(event.target.value), backoff: "fixed", initialIntervalMs: 100 } },
            })
          }
        />
      </label>
      <h3>Timeout</h3>
      <label>
        Duration
        <input value={String(props.node.config.timeout ?? "")} onChange={(event) => props.onNode(props.node.id, { config: { timeout: event.target.value || undefined } })} />
      </label>
    </div>
  );
}

function referenceFor(source: string, field: string, definition: WorkflowDefinition): ValueReference {
  if (source === "node") {
    return { source: "node", nodeId: definition.nodes[0]?.id ?? "start", path: field };
  }
  if (source === "state") {
    return { source: "state", path: field };
  }
  if (source === "literal") {
    return { source: "literal", value: "" };
  }
  return { source: "input", path: field };
}

function parseLiteral(value: string): unknown {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return value;
}
