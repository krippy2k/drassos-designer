import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  connectEngine,
  editState,
  nextConnectionStatus,
  watchRemoteExecution,
  type ConnectionStatus,
  type RemoteDesignerClient,
  type WorkflowSummary,
} from "@drassos/designer-client";
import {
  addEdge,
  addNode,
  generateNodeProject,
  implementationCounts,
  insertNodeOnEdge,
  createWorkflowDraft,
  zipTextFiles,
  deleteEdge,
  deleteNode,
  ensureLayout,
  moveNode,
  revisionOf,
  setCondition,
  setInputMapping,
  setSchemaField,
  updateNode,
  updateWorkflowDetails,
  type CapabilityDescriptor,
  type ComparisonExpression,
  type ExecutionProjection,
  type NodeRunStatus,
  type ValueReference,
  type WorkflowDefinition,
  type WorkflowDiagnostic,
} from "@drassos/designer-model";
import { ConnectionBar } from "./components/ConnectionBar.tsx";
import type { DesignerResourceOption } from "./components/Properties.tsx";
import { BottomPanel, CreateDialog, RunDialog } from "./components/BottomPanel.tsx";
import { shellGridRows } from "./layout.ts";
import { Canvas } from "./components/Canvas.tsx";
import { Explorer } from "./components/Explorer.tsx";
import { Palette } from "./components/Palette.tsx";
import { Properties } from "./components/Properties.tsx";
import "./designer.css";

export interface DesignerPackageState {
  definition: WorkflowDefinition | null;
  published: { version: string; packageDigest: string } | null;
  onPublished: (next: { version: string; packageDigest: string }) => void;
  onImported: (definition: WorkflowDefinition) => void;
  onOpened: (opened: { definition: WorkflowDefinition; version: string; packageDigest: string }) => void;
  onError: (message: string) => void;
}

export function Designer(props: {
  lockedWorkflowId?: string;
  projectId?: string;
  sessionToken?: string;
  endpoint?: string;
  token?: string;
  resourcesPath?: string;
  exitLabel?: string;
  onExit?: () => void;
  loadWorkflow?: (id: string) => Promise<{ definition: WorkflowDefinition; revision: string }>;
  saveWorkflow?: (definition: WorkflowDefinition, revision?: string) => Promise<{ revision: string }>;
  listWorkflows?: () => Promise<WorkflowSummary[]>;
  onOpenWorkflow?: (workflow: WorkflowSummary) => void;
  onDraftCreated?: (definition: WorkflowDefinition) => Promise<void> | void;
  onWorkflowPersisted?: (definition: WorkflowDefinition, revision: string, baseRevision: string | null) => void;
  startRun?: (workflowId: string, input: Record<string, unknown>, version: string, environment: string, packageDigest?: string) => Promise<{ executionId: string }>;
  renderPackages?: (state: DesignerPackageState) => ReactNode;
  initialWorkflow?: { definition: WorkflowDefinition; revision: string; supersededRevisions?: string[] };
} = {}) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>(() => props.initialWorkflow ? [workflowSummary(props.initialWorkflow.definition)] : []);
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(() => props.initialWorkflow ? ensureLayout(props.initialWorkflow.definition) : null);
  const [savedRevision, setSavedRevision] = useState<string | null>(() => props.initialWorkflow?.revision ?? null);
  const [contentRevision, setContentRevision] = useState<string | null>(() => props.initialWorkflow ? revisionOf(ensureLayout(props.initialWorkflow.definition)) : null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<WorkflowDiagnostic[]>([]);
  const [activities, setActivities] = useState<CapabilityDescriptor[]>([]);
  const [agents, setAgents] = useState<CapabilityDescriptor[]>([]);
  const [capabilityWorkflows, setCapabilityWorkflows] = useState<CapabilityDescriptor[]>([]);
  const [tab, setTab] = useState<"problems" | "execution" | "events" | "output">("problems");
  const [execution, setExecution] = useState<ExecutionProjection | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"create" | "run" | null>(null);
  const [history, setHistory] = useState<WorkflowDefinition[]>([]);
  const [future, setFuture] = useState<WorkflowDefinition[]>([]);
  const [endpoint, setEndpoint] = useState(() => props.endpoint ?? defaultEndpoint());
  const [token, setToken] = useState(() => props.token ?? defaultToken());
  const [status, setStatus] = useState<ConnectionStatus>("DISCONNECTED");
  const [remote, setRemote] = useState<RemoteDesignerClient | null>(null);
  const [workerCount, setWorkerCount] = useState(0);
  const [published, setPublished] = useState<{ version: string; packageDigest: string; snapshot: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [resources, setResources] = useState<DesignerResourceOption[]>([]);

  const dirty = definition != null && (savedRevision == null || revisionOf(definition) !== contentRevision);
  const selectedNode = definition?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const localsRef = useRef<Record<string, { definition: WorkflowDefinition; savedRevision: string | null; contentRevision: string | null }>>({});
  const revisionRef = useRef<string | null>(props.initialWorkflow?.revision ?? null);
  const saveLock = useRef(false);
  const openRef = useRef<WorkflowDefinition | null>(definition);
  const loadWorkflowRef = useRef(props.loadWorkflow);
  const loadSeq = useRef(0);
  const savedLocal = useRef<Record<string, { revision: string; baseRevision: string | null }>>({});
  const baselines = useRef<Record<string, string>>({});
  const supersededRef = useRef(props.initialWorkflow?.supersededRevisions);
  const initialWorkflowRef = useRef(props.initialWorkflow);
  openRef.current = definition;
  loadWorkflowRef.current = props.loadWorkflow;
  supersededRef.current = props.initialWorkflow?.supersededRevisions;
  initialWorkflowRef.current = props.initialWorkflow;

  useEffect(() => {
    if (!definition) {
      return;
    }
    localsRef.current[`${definition.id}@${definition.version}`] = { definition, savedRevision, contentRevision };
  }, [definition, savedRevision, contentRevision]);

  useEffect(() => {
    if (!props.initialWorkflow) {
      return;
    }
    const next = ensureLayout(props.initialWorkflow.definition);
    setDefinition((current) => current ?? next);
    setSavedRevision((current) => current ?? props.initialWorkflow?.revision ?? null);
    setContentRevision((current) => current ?? revisionOf(next));
    if (revisionRef.current == null) revisionRef.current = props.initialWorkflow.revision;
    setWorkflows((current) => withOpenWorkflows(current, next, localsRef.current));
    setBanner((current) => current === "Workflow was not found" ? null : current);
  }, [props.initialWorkflow?.definition.id, props.initialWorkflow?.revision]);

  const refresh = useCallback(async () => {
    if (!remote && !props.listWorkflows) {
      return;
    }
    try {
      const listed = props.listWorkflows ? await props.listWorkflows() : await remote!.listWorkflows();
      setWorkflows(withOpenWorkflows(listed, openRef.current, localsRef.current));
      if (!remote) {
        setBanner(null);
        return;
      }
      const [capabilities, workers] = await Promise.all([remote.listCapabilities(), remote.workers()]);
      setActivities(capabilities.activities);
      setAgents(capabilities.agents);
      setCapabilityWorkflows(capabilities.workflows);
      setWorkerCount(workers.filter((worker) => worker.status === "online").length);
      setBanner(null);
      setStatus("CONNECTED");
    } catch (error) {
      setStatus(nextConnectionStatus("CONNECTED", "unavailable"));
      setBanner(error instanceof Error ? error.message : "Drassos Engine is unavailable");
    }
  }, [remote, props.listWorkflows]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!props.resourcesPath || !props.sessionToken) {
      return;
    }
    void fetch(props.resourcesPath, { headers: { authorization: `Bearer ${props.sessionToken}` } })
      .then(async (response) => response.ok ? response.json() as Promise<{ resources?: DesignerResourceOption[] }> : { resources: [] })
      .then((body) => setResources(body.resources ?? []))
      .catch(() => setResources([]));
  }, [props.resourcesPath, props.sessionToken]);

  useEffect(() => {
    void connect();
    // The local engine address is fixed until connection settings exist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!definition || !remote) {
      return;
    }
    const timer = setTimeout(() => {
      void remote.validateWorkflow(definition).then(setDiagnostics).catch((error: Error) => {
        setBanner(error.message);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [definition, remote]);

  useEffect(() => {
    if (!remote || !execution || execution.status === "COMPLETED" || execution.status === "FAILED" || execution.status === "CANCELLED") {
      return;
    }
    const controller = new AbortController();
    const afterSeq = execution.events.at(-1)?.seq ?? 0;
    void watchRemoteExecution(remote, execution.executionId, afterSeq, () => {
      void remote.getExecution(execution.executionId).then(setExecution).catch(() => undefined);
    }, controller.signal).catch((error: Error) => {
      if (controller.signal.aborted) {
        return;
      }
      setBanner(error.message);
      setStatus(nextConnectionStatus("CONNECTED", "unavailable"));
      void remote.getExecution(execution.executionId).then(setExecution).catch(() => undefined);
    });
    return () => controller.abort();
  }, [execution?.executionId, execution?.status, remote]);

  useEffect(() => {
    if (!props.lockedWorkflowId) {
      return;
    }
    const workflowId = props.lockedWorkflowId;
    const requestId = ++loadSeq.current;
    const remembered = rememberedWorkflow(localsRef.current, workflowId);
    if (remembered && openRef.current?.id !== workflowId) {
      setDefinition(ensureLayout(remembered.definition));
      revisionRef.current = remembered.savedRevision;
      setSavedRevision(remembered.savedRevision);
      setContentRevision(remembered.contentRevision);
      setSelectedNodeId(null);
      setHistory([]);
      setFuture([]);
    }
    const current = remembered?.definition ?? (openRef.current?.id === workflowId ? openRef.current : null);
    const baseline = baselines.current[workflowId];
    if (current && baseline && revisionOf(current) !== baseline) {
      return;
    }
    const load = loadWorkflowRef.current
      ? loadWorkflowRef.current(workflowId)
      : remote
        ? remote.getWorkflow(workflowId)
        : null;
    if (!load) {
      return;
    }
    void load.then((loaded) => {
      if (requestId !== loadSeq.current || loaded.definition.id !== workflowId) {
        return;
      }
      if (staleSavedRevision(workflowId, loaded.revision, savedLocal.current, initialWorkflowRef.current)) {
        return;
      }
      const next = ensureLayout(loaded.definition);
      baselines.current[workflowId] = revisionOf(next);
      setDefinition(next);
      revisionRef.current = loaded.revision;
      setSavedRevision(loaded.revision);
      setContentRevision(revisionOf(next));
      setWorkflows((items) => withOpenWorkflows(items, next, localsRef.current));
      setBanner(null);
    }).catch((error: Error) => {
      if (requestId !== loadSeq.current) {
        return;
      }
      if (remembered) {
        setDefinition(ensureLayout(remembered.definition));
        revisionRef.current = remembered.savedRevision;
        setSavedRevision(remembered.savedRevision);
        setContentRevision(remembered.contentRevision);
        return;
      }
      if (!openRef.current) setBanner(error instanceof Error ? error.message : "Workflow was not found");
    });
  }, [remote, props.lockedWorkflowId]);

  function edit(next: WorkflowDefinition) {
    loadSeq.current += 1;
    if (definition) {
      setHistory((stack) => [...stack.slice(-49), definition]);
      setFuture([]);
    }
    setDefinition(ensureLayout(next));
  }

  function openWorkflow(summary: WorkflowSummary) {
    if (props.onOpenWorkflow) {
      props.onOpenWorkflow(summary);
      return;
    }
    const stored = localsRef.current[`${summary.id}@${summary.version}`];
    const localDraft = stored != null && (stored.savedRevision === null || revisionOf(ensureLayout(stored.definition)) !== stored.contentRevision);
    if (localDraft && stored) {
      setDefinition(ensureLayout(stored.definition));
      revisionRef.current = stored.savedRevision;
      setSavedRevision(stored.savedRevision);
      setContentRevision(stored.contentRevision);
      setSelectedNodeId(null);
      setHistory([]);
      setFuture([]);
      setBanner(null);
      return;
    }
    if (!remote) {
      setBanner("Connect to a Drassos Engine before opening a workflow");
      return;
    }
    void remote.getWorkflow(summary.id, summary.version).then((loaded) => {
      const laidOut = ensureLayout(loaded.definition);
      const revision = loaded.definition.metadata?.source === "code" ? revisionOf(laidOut) : loaded.revision;
      setDefinition(laidOut);
      revisionRef.current = revision;
      setSavedRevision(revision);
      setContentRevision(revisionOf(laidOut));
      setSelectedNodeId(null);
      setHistory([]);
      setFuture([]);
      setBanner(
        loaded.definition.metadata?.source === "code"
          ? `${loaded.definition.name} is registered from application code. Run executes that code on the engine.`
          : null,
      );
    }).catch((error: Error) => setBanner(error.message));
  }

  async function write(current: WorkflowDefinition): Promise<{ revision: string } | null> {
    const baseRevision = revisionRef.current;
    try {
      const result = props.saveWorkflow
        ? await props.saveWorkflow(current, baseRevision ?? undefined)
        : remote
          ? await remote.saveWorkflow(current, baseRevision ?? undefined)
          : null;
      if (!result) {
        return null;
      }
      revisionRef.current = result.revision;
      savedLocal.current[current.id] = { revision: result.revision, baseRevision };
      const hash = revisionOf(current);
      baselines.current[current.id] = hash;
      setContentRevision(hash);
      setSavedRevision(result.revision);
      props.onWorkflowPersisted?.(current, result.revision, baseRevision);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed";
      setSaveFailed(!message.includes("Reload before saving"));
      setConflict(message.includes("Reload before saving"));
      setBanner(message);
      return null;
    }
  }

  async function save() {
    if (!definition || (!remote && !props.saveWorkflow) || saveLock.current) {
      return;
    }
    if (definition.metadata?.source === "code") {
      setBanner(`${definition.name} is registered from application code. Create a new workflow to save a visual definition.`);
      return;
    }
    saveLock.current = true;
    loadSeq.current += 1;
    setSaving(true);
    setConflict(false);
    setSaveFailed(false);
    try {
      if (remote) {
        try {
          setDiagnostics(await remote.validateWorkflow(definition));
        } catch (error) {
          setBanner(error instanceof Error ? error.message : "Validation failed");
        }
      }
      const result = await write(definition);
      if (!result) {
        return;
      }
      setBanner(null);
      await refresh();
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function run(input: Record<string, unknown>, environment = "development") {
    if (!definition || (!remote && !props.startRun)) {
      return;
    }
    setDialog(null);
    if (remote) {
      const diagnosticsNow = await remote.validateWorkflow(definition);
      setDiagnostics(diagnosticsNow);
      if (diagnosticsNow.some((item) => item.severity === "error")) {
        setTab("problems");
        const unfinished = implementationCounts(definition).unimplemented > 0
          ? " Unimplemented activities must be implemented before this workflow can run."
          : "";
        setBanner(`Definition Validation: the workflow cannot run until the errors are fixed.${unfinished}`);
        return;
      }
    }
    if (definition.metadata?.source !== "code" && (dirty || revisionRef.current == null)) {
      if (saveLock.current) {
        return;
      }
      saveLock.current = true;
      loadSeq.current += 1;
      setSaving(true);
      setConflict(false);
      setSaveFailed(false);
      try {
        const result = await write(definition);
        if (!result) {
          return;
        }
      } finally {
        saveLock.current = false;
        setSaving(false);
      }
    }
    const packageDigest = published && published.snapshot === JSON.stringify(definition) ? published.packageDigest : undefined;
    const started = props.startRun
      ? await (remote
        ? remote.getExecution((await props.startRun(definition.id, input, definition.version, environment, packageDigest)).executionId)
        : Promise.reject(new Error("Connect to a Drassos Engine before running a workflow")))
      : await remote!.runWorkflow(definition.id, input, definition.version, environment);
    setExecution(started);
    sessionStorage.setItem("drassos-designer-execution", started.executionId);
    setTab("events");
  }

  async function connect() {
    setStatus(nextConnectionStatus(status, "connect"));
    try {
      const client = await connectEngine(endpoint, token || undefined);
      localStorage.setItem("drassos-designer-endpoint", endpoint);
      setRemote(client);
      setStatus("CONNECTED");
      setBanner(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Drassos Engine is unavailable";
      if (message.includes("Authentication")) {
        setStatus("AUTHENTICATION_FAILED");
      } else if (message.includes("not supported")) {
        setStatus("INCOMPATIBLE");
      } else {
        setStatus(nextConnectionStatus(status, "unavailable"));
      }
      setBanner(message);
    }
  }

  const label = editState({ dirty, saving, conflict, failed: saveFailed });
  const statuses = useMemo(() => {
    const map: Record<string, NodeRunStatus | undefined> = {};
    for (const [nodeId, node] of Object.entries(execution?.nodes ?? {})) {
      map[nodeId] = node.status;
    }
    return map;
  }, [execution]);

  return (
    <div className="designer-host shell" style={{ gridTemplateRows: shellGridRows(banner != null) }}>
      <header className="toolbar">
        {props.onExit ? <button type="button" onClick={props.onExit}>{props.exitLabel ?? "Back"}</button> : hostedDesigner() ? <a href="/">Cloud</a> : null}
        <strong>Drassos Designer</strong>
        <ConnectionBar
          status={status}
          endpoint={endpoint}
          info={remote?.info ?? null}
          workerCount={workerCount}
          editLabel={label}
          onEndpoint={setEndpoint}
          onToken={setToken}
          onConnect={() => void connect()}
        />
        <span>{definition ? `${definition.name}${dirty ? " *" : ""}` : "No workflow"}</span>
        {definition && implementationCounts(definition).total > 0 ? (
          <span>{implementationSummary(definition)}</span>
        ) : null}
        <button type="button" disabled={!history.length} onClick={() => {
          const previous = history[history.length - 1];
          if (!previous || !definition) {
            return;
          }
          setFuture((stack) => [definition, ...stack]);
          setHistory((stack) => stack.slice(0, -1));
          setDefinition(previous);
        }}>
          Undo
        </button>
        <button type="button" disabled={!future.length} onClick={() => {
          const next = future[0];
          if (!next || !definition) {
            return;
          }
          setHistory((stack) => [...stack, definition]);
          setFuture((stack) => stack.slice(1));
          setDefinition(next);
        }}>
          Redo
        </button>
        <button type="button" onClick={() => void save()} disabled={!definition || saving || (!remote && !props.saveWorkflow)}>
          Save
        </button>
        <button type="button" onClick={() => definition && exportDefinitionFile(definition)} disabled={!definition}>
          Export
        </button>
        <button type="button" onClick={() => definition && exportNodeProject(definition)} disabled={!definition}>
          Export project
        </button>
        <button type="button" onClick={() => setDialog("run")} disabled={!definition || (!remote && !props.startRun)}>
          Run
        </button>
        {props.renderPackages?.({
          definition,
          published: published ? { version: published.version, packageDigest: published.packageDigest } : null,
          onPublished: (next) => setPublished({ ...next, snapshot: JSON.stringify(definition) }),
          onImported: (imported) => {
            setPublished(null);
            setDefinition(ensureLayout(imported));
            setSelectedNodeId(null);
          },
          onOpened: (opened) => {
            const next = ensureLayout(opened.definition);
            setDefinition(next);
            setPublished({ version: opened.version, packageDigest: opened.packageDigest, snapshot: JSON.stringify(next) });
            setSelectedNodeId(null);
          },
          onError: setBanner,
        })}
        <button
          type="button"
          disabled={!remote || !execution || execution.status === "COMPLETED" || execution.status === "FAILED" || execution.status === "CANCELLED"}
          onClick={() => {
            if (!remote || !execution) {
              return;
            }
            void remote.cancel(execution.executionId).then(() => remote.getExecution(execution.executionId)).then(setExecution).catch((error: Error) => setBanner(error.message));
          }}
        >
          Cancel
        </button>
      </header>
      {banner ? <p className="banner">{banner}</p> : null}
      <div className="workspace">
        <div className="side">
          <Explorer
            workflows={workflows}
            activeId={definition?.id}
            dirty={dirty}
            onOpen={openWorkflow}
            onCreate={() => setDialog("create")}
            onRefresh={() => void refresh()}
          />
          <Palette />
        </div>
        {definition ? (
          <Canvas
            definition={definition}
            diagnostics={diagnostics}
            statuses={statuses}
            onSelectNode={setSelectedNodeId}
            onSelectEdge={() => undefined}
            onMove={(nodeId, position) => edit(moveNode(definition, nodeId, position))}
            onConnect={(connection) => {
              const next = addEdge(definition, connection.source, connection.target, connection.sourcePort);
              if ("error" in next) {
                setBanner(`Designer: ${next.error}`);
                return;
              }
              edit(next);
            }}
            onDeleteNode={(nodeId) => edit(deleteNode(definition, nodeId))}
            onDeleteEdge={(edgeId) => edit(deleteEdge(definition, edgeId))}
            onAddNode={(type, position, edgeId) => {
              const added = edgeId ? insertNodeOnEdge(definition, edgeId, type, position) : addNode(definition, type, position);
              if ("error" in added) {
                setBanner(`Designer: ${added.error}`);
                return;
              }
              edit(added.definition);
              setSelectedNodeId(added.nodeId);
            }}
          />
        ) : (
          <main className="empty">Connect to a Drassos app and open a workflow.</main>
        )}
        <Properties
          definition={definition}
          node={selectedNode}
          activities={activities}
          agents={agents}
          workflows={capabilityWorkflows}
          resources={resources}
          onWorkflow={(patch) => definition && edit(updateWorkflowDetails(definition, patch))}
          onSchema={(kind, name, schema, previousName) => {
            if (!definition) {
              return;
            }
            const removed = previousName && previousName !== name ? setSchemaField(definition, kind, previousName, null) : definition;
            edit(setSchemaField(removed, kind, name, schema));
          }}
          onNode={(nodeId, patch) => definition && edit(updateNode(definition, nodeId, patch))}
          onMapping={(nodeId, field, reference: ValueReference | null) => definition && edit(setInputMapping(definition, nodeId, field, reference))}
          onCondition={(nodeId, expression: ComparisonExpression) => definition && edit(setCondition(definition, nodeId, expression))}
          testActivity={remote ? (request) => remote.testActivity(request) : undefined}
        />
      </div>
      <BottomPanel
        tab={tab}
        onTab={setTab}
        diagnostics={diagnostics}
        execution={execution}
        selectedNodeId={selectedNodeId ?? undefined}
        onSelectDiagnostic={(diagnostic) => {
          if (diagnostic.nodeId) {
            setSelectedNodeId(diagnostic.nodeId);
          }
        }}
        onSelectEvent={(event) => {
          if (event.nodeId) {
            setSelectedNodeId(event.nodeId);
            setTab("execution");
          }
        }}
      />
      {dialog === "create" ? (
        <CreateDialog
          onCancel={() => setDialog(null)}
          onCreate={(value) => {
            const draft = createWorkflowDraft(value);
            setDefinition(draft);
            revisionRef.current = null;
            setSavedRevision(null);
            setContentRevision(null);
            setSelectedNodeId(null);
            setDialog(null);
            setWorkflows((current) => [...current, { id: draft.id, name: draft.name, version: draft.version, schemaVersion: draft.schemaVersion }]);
            if (props.onDraftCreated) {
              void Promise.resolve(props.onDraftCreated(draft)).catch((error: Error) => setBanner(error.message));
            }
          }}
        />
      ) : null}
      {dialog === "run" && definition ? (
        <RunDialog
          fields={Object.entries(definition.inputs ?? {}).map(([name, schema]) => ({ name, type: schema.type }))}
          onCancel={() => setDialog(null)}
          onRun={(input, environment) => void run(input, environment).catch((error: Error) => setBanner(error.message))}
        />
      ) : null}
    </div>
  );
}

function implementationSummary(definition: WorkflowDefinition): string {
  const counts = implementationCounts(definition);
  return `${counts.unimplemented} not implemented · ${counts.inline} inline · ${counts.external} external`;
}

function exportNodeProject(definition: WorkflowDefinition): void {
  const bytes = zipTextFiles(generateNodeProject(definition));
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${definition.id || "workflow"}-project.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportDefinitionFile(definition: WorkflowDefinition): void {
  const blob = new Blob([`${JSON.stringify(definition, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${definition.id || "workflow"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function workflowSummary(definition: WorkflowDefinition): WorkflowSummary {
  return {
    id: definition.id,
    name: definition.name,
    version: definition.version,
    schemaVersion: definition.schemaVersion,
    description: definition.description,
  };
}

function rememberedWorkflow(
  locals: Record<string, { definition: WorkflowDefinition; savedRevision: string | null; contentRevision: string | null }>,
  workflowId: string,
): { definition: WorkflowDefinition; savedRevision: string | null; contentRevision: string | null } | undefined {
  return Object.values(locals).find((item) => item.definition.id === workflowId);
}

function staleSavedRevision(
  workflowId: string,
  loadedRevision: string,
  saved: Record<string, { revision: string; baseRevision: string | null }>,
  initial: { definition: WorkflowDefinition; revision: string; supersededRevisions?: string[] } | undefined,
): boolean {
  const known = saved[workflowId];
  if (known && loadedRevision !== known.revision) {
    return true;
  }
  const initialMatches = initial?.definition.id === workflowId ? initial : undefined;
  const currentRevision = known?.revision ?? initialMatches?.revision;
  if (!currentRevision || loadedRevision === currentRevision) {
    return false;
  }
  const superseded = new Set(initialMatches?.supersededRevisions ?? []);
  if (known?.baseRevision) superseded.add(known.baseRevision);
  return superseded.has(loadedRevision);
}

function withOpenWorkflows(
  listed: WorkflowSummary[],
  open: WorkflowDefinition | null,
  locals: Record<string, { definition: WorkflowDefinition; savedRevision: string | null; contentRevision: string | null }>,
): WorkflowSummary[] {
  const extras = Object.values(locals)
    .filter((item) => item.savedRevision === null)
    .map((item) => item.definition);
  if (open) extras.push(open);
  const additions = extras
    .filter((item, index) => extras.findIndex((other) => other.id === item.id && other.version === item.version) === index)
    .filter((item) => !listed.some((workflow) => workflow.id === item.id && workflow.version === item.version))
    .map(workflowSummary);
  return [...listed, ...additions];
}

function hostedDesigner(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/designer");
}

function defaultEndpoint(): string {
  return hostedDesigner() ? `${window.location.origin}/d-engine` : "http://127.0.0.1:3100";
}

function defaultToken(): string {
  if (!hostedDesigner()) {
    return "";
  }
  try {
    const session = JSON.parse(sessionStorage.getItem("drassos-cloud-session") || "null") as { token?: string } | null;
    return session?.token ?? "";
  } catch {
    return "";
  }
}
