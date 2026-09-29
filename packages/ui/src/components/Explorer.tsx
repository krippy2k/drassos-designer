import type { WorkflowSummary } from "@drassos/designer-client";

export function Explorer(props: {
  workflows: WorkflowSummary[];
  activeId?: string;
  dirty: boolean;
  onOpen: (workflow: WorkflowSummary) => void;
  onCreate: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="explorer">
      <header>
        <h2>Workflows</h2>
        <button type="button" onClick={props.onRefresh}>
          Refresh
        </button>
      </header>
      <ul>
        {props.workflows.map((workflow) => (
          <li key={`${workflow.id}@${workflow.version}`}>
            <button
              type="button"
              className={workflow.id === props.activeId ? "active" : ""}
              onClick={() => props.onOpen(workflow)}
            >
              <strong>
                {workflow.name}
                {workflow.id === props.activeId && props.dirty ? " *" : ""}
              </strong>
              <span>
                {workflow.id} · {workflow.version}
                {workflow.source === "code" ? " · code" : ""}
              </span>
              {workflow.description ? <small>{workflow.description}</small> : null}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="create" onClick={props.onCreate}>
        New workflow
      </button>
    </section>
  );
}
