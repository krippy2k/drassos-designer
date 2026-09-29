import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { edgeUnderPoint, implementationKind, nodeSubtitle, readLayout, type NodeRunStatus, type WorkflowDefinition, type WorkflowDiagnostic } from "@drassos/designer-model";

const STATUS_MARK: Record<NodeRunStatus, string> = {
  "not-started": "○",
  running: "●",
  completed: "✓",
  failed: "✕",
  waiting: "◷",
  retrying: "↻",
};

function DesignerNodeView({ data }: NodeProps) {
  const node = data as {
    title: string;
    kind: string;
    subtitle: string;
    status?: NodeRunStatus;
    invalid?: boolean;
    implementation?: string;
    duration?: string;
    tokens?: string;
    cost?: string;
  };
  return (
    <div className={`flow-node ${node.invalid ? "invalid" : ""} ${node.status ?? ""} ${node.implementation ?? ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="kind">
        {node.status ? STATUS_MARK[node.status] : ""} {node.kind}
      </div>
      <strong>{node.title}</strong>
      <small>{node.subtitle}</small>
      {node.duration ? <small>{node.duration}</small> : null}
      {node.tokens ? <small>{node.tokens}</small> : null}
      {node.cost ? <small>{node.cost}</small> : null}
      {node.kind === "condition" ? (
        <>
          <Handle id="true" type="source" position={Position.Right} style={{ top: "35%" }} />
          <Handle id="false" type="source" position={Position.Right} style={{ top: "70%" }} />
        </>
      ) : (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
}

const nodeTypes = { designer: DesignerNodeView };

export function toFlow(
  definition: WorkflowDefinition,
  diagnostics: WorkflowDiagnostic[],
  statuses: Record<string, NodeRunStatus | undefined>,
  annotations: Record<string, { duration?: string; tokens?: string; cost?: string } | undefined> = {},
) {
  const layout = readLayout(definition);
  const invalid = new Set(diagnostics.filter((item) => item.severity === "error" && item.nodeId).map((item) => item.nodeId));
  const nodes: Node[] = definition.nodes.map((node) => ({
    id: node.id,
    type: "designer",
    position: layout[node.id] ?? { x: 0, y: 0 },
    data: {
      title: node.name ?? node.id,
      kind: node.type,
      subtitle: nodeSubtitle(node),
      status: statuses[node.id],
      invalid: invalid.has(node.id),
      implementation: node.type === "activity" ? canvasImplementation(node) : "",
      duration: annotations[node.id]?.duration,
      tokens: annotations[node.id]?.tokens,
      cost: annotations[node.id]?.cost,
    },
  }));
  const edges: Edge[] = definition.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourcePort,
    label: edge.sourcePort,
  }));
  return { nodes, edges };
}

function canvasImplementation(node: WorkflowDefinition["nodes"][number]): string {
  const kind = implementationKind(node);
  if (kind === "inline-typescript" || kind === "inline-javascript") {
    return "inline";
  }
  return kind;
}

export function Canvas(props: {
  definition: WorkflowDefinition;
  diagnostics: WorkflowDiagnostic[];
  statuses: Record<string, NodeRunStatus | undefined>;
  annotations?: Record<string, { duration?: string; tokens?: string; cost?: string } | undefined>;
  onSelectNode: (nodeId: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onMove: (nodeId: string, position: { x: number; y: number }) => void;
  onConnect: (connection: { source: string; target: string; sourcePort?: string }) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onAddNode: (type: string, position: { x: number; y: number }, edgeId?: string) => void;
}) {
  const graph = useMemo(
    () => toFlow(props.definition, props.diagnostics, props.statuses, props.annotations),
    [props.definition, props.diagnostics, props.statuses, props.annotations],
  );
  return (
    <div className="canvas">
      <ReactFlowProvider>
        <FlowSurface {...props} initialNodes={graph.nodes} initialEdges={graph.edges} />
      </ReactFlowProvider>
    </div>
  );
}

function FlowSurface(props: {
  initialNodes: Node[];
  initialEdges: Edge[];
  onSelectNode: (nodeId: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onMove: (nodeId: string, position: { x: number; y: number }) => void;
  onConnect: (connection: { source: string; target: string; sourcePort?: string }) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  definition: WorkflowDefinition;
  onAddNode: (type: string, position: { x: number; y: number }, edgeId?: string) => void;
}) {
  const flow = useReactFlow();
  const [nodes, setNodes] = useState(props.initialNodes);
  const [edges, setEdges] = useState(props.initialEdges);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | undefined>();
  useEffect(() => {
    setNodes((current) =>
      props.initialNodes.map((node) => {
        const existing = current.find((item) => item.id === node.id);
        if (!existing) {
          return node;
        }
        return {
          ...node,
          measured: existing.measured,
          selected: existing.selected,
          width: existing.width ?? node.width,
          height: existing.height ?? node.height,
        };
      }),
    );
    setEdges(props.initialEdges.map((edge) => (edge.id === hoveredEdgeId ? { ...edge, style: { stroke: "#e6b35a", strokeWidth: 3 } } : edge)));
  }, [props.initialNodes, props.initialEdges, hoveredEdgeId]);
  return (
    <>
      <button type="button" className="fit" onClick={() => flow.fitView({ padding: 0.2 })}>
        Fit
      </button>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        onNodesChange={(changes: NodeChange[]) => {
          setNodes((current) => applyNodeChanges(changes.filter((change) => change.type !== "remove"), current));
          for (const change of changes) {
            if (change.type === "position" && change.position && change.dragging === false) {
              props.onMove(change.id, change.position);
            }
            if (change.type === "select") {
              props.onSelectNode(change.selected ? change.id : null);
            }
          }
        }}
        onEdgesChange={(changes) => {
          setEdges((current) => applyEdgeChanges(changes.filter((change) => change.type !== "remove"), current));
          for (const change of changes) {
            if (change.type === "select") {
              props.onSelectEdge(change.selected ? change.id : null);
            }
          }
        }}
        onNodesDelete={(deleted) => {
          for (const node of deleted) {
            props.onDeleteNode(node.id);
          }
        }}
        onEdgesDelete={(deleted) => {
          for (const edge of deleted) {
            props.onDeleteEdge(edge.id);
          }
        }}
        onConnect={(connection: Connection) => {
          if (!connection.source || !connection.target) {
            return;
          }
          props.onConnect({ source: connection.source, target: connection.target, sourcePort: connection.sourceHandle ?? undefined });
        }}
        onPaneClick={() => {
          props.onSelectNode(null);
          props.onSelectEdge(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          const type = event.dataTransfer.getData("application/drassos-node");
          if (!type) {
            return;
          }
          const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
          props.onAddNode(type, position, edgeUnderPoint(props.definition, position));
          setHoveredEdgeId(undefined);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
          const edgeId = edgeUnderPoint(props.definition, position);
          setHoveredEdgeId((current) => (current === edgeId ? current : edgeId));
        }}
        onDragLeave={() => setHoveredEdgeId(undefined)}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </>
  );
}
