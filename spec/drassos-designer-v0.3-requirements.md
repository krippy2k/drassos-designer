# Drassos Designer SaaS --- Requirements

**Status:** Draft\
**Scope:** Drassos Designer SaaS, supporting Designer backend services,
and required Drassos Engine integration\
**Purpose:** Expand Drassos Designer into a multi-tenant SaaS for
creating projects and workflows, visually designing workflows,
inspecting workflow runs, debugging step executions, and observing
execution cost as a first-class metric.

## 1. Product Vision

Drassos Designer SHALL become the primary web-based control plane for
building, running, observing, and debugging Drassos workflows.

A user SHALL be able to register, sign in, create one or more projects,
create workflows within those projects, visually design workflows,
inspect all workflow runs, open an individual run as an execution graph,
inspect node inputs/outputs/logs/attempts, and observe AI execution cost
directly in the graph.

``` text
Drassos
└── Tenant / Account
    ├── Project A
    │   ├── Workflow 1
    │   │   ├── Definition / Versions
    │   │   └── Runs
    │   │       ├── Run 001
    │   │       └── Run 002
    │   └── Workflow 2
    └── Project B
        └── Workflow 3
```

## 2. Architectural Principles

### 2.1 Designer Is the SaaS Control Plane

Designer SHALL communicate with Drassos Engine through versioned public
APIs and event streams. Designer SHALL NOT execute workflow steps,
directly schedule workers, directly communicate with workers, or depend
on engine persistence internals.

``` text
Designer SaaS
     │
     │ Control API / Events
     ▼
Drassos Engine
     │
     ▼
Remote Workers
```

### 2.2 Project Is the Primary Resource Boundary

Every workflow SHALL belong to a project. Every workflow run SHALL
therefore be attributable to a project.

The architecture SHALL permit future project-level membership, roles,
API keys, workers, environments, secrets, usage limits, budgets, and
billing.

### 2.3 Cost Is First-Class Observability Data

Execution cost SHALL be treated as a core runtime metric alongside
status, duration, attempts, logs, errors, token usage, and worker
assignment.

Designer SHALL visualize authoritative persisted cost data rather than
independently reconstructing historical costs from current provider
prices.

## 3. Multi-Tenancy

The system SHALL establish a tenant boundary for SaaS resources
including projects, workflows, versions, workflow-run access, inputs,
outputs, logs, usage, cost, and engine configuration.

The initial product MAY automatically create one tenant/account for each
registered user. The model SHALL allow multiple users per tenant in the
future.

Every tenant-scoped request SHALL be authorized server-side.
Browser-provided tenant IDs SHALL NOT constitute authorization.

A user in one tenant MUST NOT be able to retrieve another tenant's
resources by guessing IDs, modifying URLs/API requests, querying
execution IDs, or subscribing to unauthorized event streams.

## 4. Authentication and Authorization

Users SHALL be able to register, sign in, and sign out.

Initial registration SHOULD support email/password or an external
identity provider. The architecture SHOULD permit Google, GitHub,
Microsoft, OIDC, and enterprise SSO later.

Authorization SHALL be enforced by backend services. Initial
authorization MAY use simple ownership, while the model SHOULD support
future roles such as Owner, Admin, Developer, Viewer, and Billing.

## 5. Projects

Authenticated users SHALL be able to create multiple projects.

A project SHALL include at minimum:

``` ts
interface Project {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}
```

A project dashboard SHOULD summarize workflows, recent runs, active
runs, failures, and execution cost.

Project navigation SHOULD include:

``` text
Overview
Workflows
Runs
Usage / Cost
Settings
```

Future navigation MAY include Workers, Secrets, Environments, Members,
API Keys, and Billing.

## 6. Workflows

Every workflow SHALL belong to exactly one project.

The project workflow list SHALL show workflow name, ID, current version,
last modified time, and recent run status where available.

Users SHALL be able to create workflows and open them in the visual
workflow editor.

Persisted workflow definitions SHOULD be versioned. Every workflow run
SHALL reference the exact workflow-definition version used for execution
so historical runs can be rendered against the graph that actually
executed.

A workflow detail experience SHOULD provide at least:

``` text
Design
Runs
```

and MAY later include Versions, Usage, and Settings.

## 7. Workflow Runs

The workflow Runs view SHALL list all authorized runs for the selected
workflow.

Each run SHALL show at minimum:

-   Run ID.
-   Status.
-   Start time.
-   End time where applicable.
-   Duration.
-   Workflow version.
-   Total execution cost where available.

Filtering SHOULD support status and date range initially.

A project SHOULD also provide a combined Runs view across all workflows.

## 8. Workflow Run Graph

Clicking a run SHALL open a visual representation of that specific
execution using the exact workflow-definition version associated with
the run.

Each node SHALL visually communicate runtime status.

Supported states SHOULD include:

``` text
PENDING
WAITING_FOR_WORKER
SCHEDULED
RUNNING
WAITING
COMPLETED
FAILED
RETRYING
CANCELLED
SKIPPED
```

Example:

``` text
┌────────────────────┐
│ Validate Order     │
│ ✓ Completed        │
│ 182 ms             │
└──────────┬─────────┘
           ▼
┌────────────────────┐
│ Research Agent     │
│ ✓ Completed        │
│ 4.21 s             │
│ $0.0673            │
└──────────┬─────────┘
           ▼
┌────────────────────┐
│ Human Approval     │
│ ● Waiting          │
└────────────────────┘
```

For active runs, the graph SHALL update from live execution events
without requiring page refresh.

Designer connectivity SHALL NOT be required for workflow execution to
continue.

## 9. Run Summary

The run view SHOULD display:

-   Run status.
-   Start/end time.
-   Duration.
-   Workflow version.
-   Completed/failed step counts.
-   Retry count.
-   Total cost.
-   Total AI/token usage where applicable.

Example:

``` text
Run: run_01K...
Status: Completed
Duration: 8.42s
Steps: 7
Retries: 1
AI tokens: 24,830
Cost: $0.1842
```

## 10. Node Runtime Inspector

Clicking a node SHALL open a runtime inspector while keeping the graph
visible where practical.

The inspector SHOULD expose:

``` text
Overview
Input
Output
Logs
Attempts
Usage
```

Overview SHALL include node name/type, status, execution ID, attempt
count, assigned worker, start/end times, duration, error summary, and
total step cost where applicable.

## 11. Input and Output Visualization

The user SHALL be able to inspect the actual resolved input supplied to
a step and the output returned by it.

Structured data SHOULD support:

-   Collapsible objects and arrays.
-   Syntax highlighting.
-   Pretty formatting.
-   Copying.
-   Raw JSON view.
-   On-demand loading for large values.

The UI SHALL distinguish no output, `null`, an empty object, and
unavailable/redacted output.

Sensitive values SHALL support engine-provided masking/redaction.

## 12. Errors, Attempts, and Logs

Failed nodes SHALL expose structured error information including error
code/message, retryability, worker, attempt, timestamp, and stack trace
where authorized.

Multiple execution attempts SHALL be independently inspectable.

Example:

``` text
Research Agent

Attempt 1
FAILED
Duration: 30.0s
Cost: $0.0214

Attempt 2
COMPLETED
Duration: 4.2s
Cost: $0.0673
```

Costs from failed or retried attempts SHALL remain part of the node/run
cost when they represent real billable usage.

Logs SHALL support streaming for active executions, historical
retrieval, timestamps, levels, structured metadata, filtering, and
search.

## 13. Cost Hierarchy

Cost SHALL be aggregatable across:

``` text
Project
  └── Workflow
       └── Workflow Run
            └── Step / Node
                 └── Execution Attempt
                      └── Usage Event
```

Where currencies are compatible:

``` text
Workflow cost = sum of run costs
Run cost      = sum of billable attempt costs
Node cost     = sum of billable attempts for that node
```

Aggregations SHALL use authoritative precision rather than rounded UI
values.

## 14. Money Representation

Monetary values MUST NOT use binary floating-point as the authoritative
representation.

Use fixed-precision decimal values or integer values in a sufficiently
small currency unit.

Example:

``` ts
interface Money {
  amount: string;
  currency: string;
}
```

``` json
{
  "amount": "0.067341",
  "currency": "USD"
}
```

The UI MAY round for display while retaining full stored precision.

## 15. Provider-Neutral Usage Model

Drassos SHALL support provider-neutral usage records:

``` ts
interface UsageMetric {
  type: string;
  quantity: number;
  unit: string;
  cost?: Money;
  metadata?: Record<string, unknown>;
}
```

This SHALL support usage such as:

``` text
LLM input/output tokens
Cached tokens
Embedding tokens
Image generation
External API calls
GPU time
Compute duration
MCP/tool invocations
Other metered services
```

## 16. AI Usage

For AI-agent execution, Drassos SHOULD capture where available:

``` ts
interface AIUsage {
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  totalCost?: Money;
}
```

Provider-specific usage SHALL be extensible without requiring a new
schema for every provider.

## 17. Usage Events

A single agent step MAY invoke models or paid tools multiple times.
Drassos SHOULD therefore retain individual usage events rather than only
a final aggregate.

``` text
Research Agent
├── LLM Call #1
│   ├── 5,240 input tokens
│   ├── 721 output tokens
│   └── $0.0312
├── Search Tool
│   └── $0.0020
└── LLM Call #2
    ├── 2,183 input tokens
    ├── 941 output tokens
    └── $0.0341

Node total: $0.0673
```

## 18. Cost Source and Historical Integrity

Each cost record SHOULD identify how its amount was determined:

``` text
PROVIDER_REPORTED
WORKER_REPORTED
DRASSOS_PRICING
USER_CONFIGURED
UNKNOWN
```

When Drassos calculates a cost, sufficient pricing metadata SHOULD be
retained to explain the historical calculation.

Historical execution cost SHALL NOT change merely because current
provider pricing changes.

## 19. AI Agent Node Visualization

AI-agent nodes SHALL display execution cost directly on the run graph
when available.

Example:

``` text
┌─────────────────────────┐
│ Research Agent          │
│ ✓ Completed             │
│                         │
│ 12.4K tokens            │
│ $0.0673                 │
│ 4.21s                   │
└─────────────────────────┘
```

Provider/model MAY also be shown if the graph remains readable. Detailed
usage SHALL live in the inspector.

## 20. AI Agent Inspector

The Usage section for an AI-agent node SHOULD show:

-   Provider.
-   Model.
-   Input/output tokens.
-   Cached/reasoning tokens where available.
-   Total tokens.
-   Individual model invocations.
-   Tool/API usage.
-   Cost by usage event.
-   Total node cost.

## 21. Run Cost Visualization

The workflow-run view SHALL prominently display total run cost when
known.

If some execution costs are unknown, Designer SHALL NOT falsely
represent a partial total as complete.

Possible states SHOULD include:

``` text
$0.1842
$0.1842+ / partial
Calculating
Unavailable
```

## 22. Cost Analytics

Designer SHOULD provide project/workflow usage views supporting:

-   Total cost over a period.
-   Cost by workflow.
-   Cost by run.
-   Cost by step.
-   Cost by AI model.
-   Token usage.
-   Average cost per run.

Future capabilities MAY include provider breakdowns, cost trends,
budgets, anomaly detection, cost-per-business-outcome metrics, and
optimization recommendations.

Execution cost observability SHALL remain conceptually separate from
Drassos subscription billing.

## 23. Engine Requirements for Usage and Cost

Drassos Engine SHALL expose observability contracts for:

-   Usage events.
-   Attempt usage/cost.
-   Step cost.
-   Run cost.
-   Token usage.
-   Provider/model metadata.

The engine SHALL associate usage with tenant, project, workflow,
workflow run, step, and execution attempt where those scopes are
available.

The engine SHALL persist usage as authoritative observability data.

## 24. Worker Usage Reporting

The Worker SDK SHALL provide a usage-reporting API.

Conceptual example:

``` ts
ctx.usage.record({
  type: "llm.tokens.input",
  quantity: 5240,
  unit: "token",
  cost: {
    amount: "0.01572",
    currency: "USD"
  },
  metadata: {
    provider: "example-provider",
    model: "example-model"
  }
});
```

Built-in AI integrations SHOULD automatically capture provider usage
where APIs expose it.

## 25. Live Usage and Events

Where practical, usage events SHOULD stream to Designer while execution
is active. The final persisted engine state remains authoritative.

Run events MAY include:

``` text
WORKFLOW_STARTED
WORKFLOW_COMPLETED
WORKFLOW_FAILED
WORKFLOW_CANCELLED
STEP_READY
STEP_WAITING_FOR_WORKER
STEP_SCHEDULED
STEP_STARTED
STEP_PROGRESS
STEP_LOG
STEP_USAGE_RECORDED
STEP_COMPLETED
STEP_FAILED
STEP_RETRY_SCHEDULED
STEP_CANCELLED
```

Event subscriptions MUST enforce tenant/project authorization.

## 26. Historical Definition Integrity

Every workflow run SHALL reference the definition version that executed.

``` text
Current workflow: v12

Run A → v12
Run B → v11
Run C → v8
```

Opening an old run SHALL display its historical graph rather than
silently substituting the current definition.

## 27. Deep Linking

Runs SHOULD have stable URLs conceptually similar to:

``` text
/projects/{projectId}/workflows/{workflowId}/runs/{runId}
```

Every deep link SHALL still require authentication and authorization.
Possession of a URL SHALL NOT grant access.

## 28. Data Retention and Sensitive Data

The architecture SHALL allow configurable retention for workflow runs,
logs, inputs, outputs, and usage events.

Deleting large logs SHOULD NOT require deleting core run metadata or
finalized cost totals.

Inputs, outputs, and logs MAY contain sensitive data. Designer SHALL
retrieve them only through authorized APIs, avoid placing sensitive
values in URLs, support redaction, prevent cross-tenant cache leakage,
and avoid unnecessary duplication.

## 29. SaaS Dashboard

The authenticated landing experience SHOULD show the user's projects.

Projects MAY summarize workflow count, active runs, recent failures, run
count, and current-period execution cost.

The initial implementation SHOULD prioritize clarity over a large
analytics dashboard.

## 30. Empty and Error States

Designer SHALL provide useful empty states for no projects, no
workflows, no runs, and no usage.

User-visible failures SHALL distinguish authentication, authorization,
engine availability, network failure, validation errors, version
conflicts, missing runs, unavailable usage, and lost live-event
connections.

## 31. Resilience

Designer connectivity SHALL NOT determine workflow lifecycle.

If the browser closes or disconnects, Engine and Workers SHALL continue
independently.

Upon reconnection, Designer SHALL retrieve authoritative state and
resume live updates.

## 32. Suggested Data Ownership

SaaS-owned data conceptually includes:

``` text
Tenant
├── Users / Memberships
└── Projects
    ├── Workflows / metadata
    ├── Engine Configuration
    └── Project Settings
```

Execution-domain data SHOULD remain engine-owned where practical:

``` text
Workflow Run
├── Workflow Version
├── Step Executions
│   └── Attempts
│       ├── Logs
│       └── Usage Events
└── Aggregated Run Usage
```

Designer SHOULD avoid creating a competing authoritative execution
database. Read-optimized projections/caches MAY be introduced later.

## 33. API Requirements

Designer SHALL have authorized APIs equivalent to:

``` text
Authentication
  Register / Sign in / Sign out / Current user

Projects
  Create / List / Get / Update

Workflows
  Create / List / Get / Save / Versions / Validate

Runs
  List project runs
  List workflow runs
  Get run
  Get run graph state
  Cancel
  Send signal

Executions
  Get step execution
  Get attempts
  Get input/output
  Get logs
  Get usage

Usage
  Get run cost
  Get workflow usage
  Get project usage

Events
  Subscribe to authorized live run events
```

Exact routes are implementation details.

## 34. Performance and Accessibility

Run lists SHALL be paginated. Large logs SHALL be paginated or
virtualized. Large input/output values SHOULD load on demand. Opening a
workflow SHALL NOT download unrelated run history. Opening a run SHALL
NOT download all logs automatically. Cost aggregation SHOULD happen
server-side.

Workflow state SHALL NOT be communicated by color alone. Interactive
nodes SHOULD support keyboard access where practical, and
status/cost/error information SHALL have textual representations.

## 35. Required Automated Tests

### Unit Tests

Cover:

-   Tenant authorization.
-   Project/workflow relationships.
-   Run-to-definition-version mapping.
-   Cost aggregation.
-   Retry cost aggregation.
-   Monetary precision.
-   Partial/unknown costs.
-   Usage aggregation.
-   Node runtime-state mapping.
-   Live event updates.
-   Authentication state.

### Integration Tests

Cover:

``` text
Designer ↔ Authentication
Designer ↔ Project API
Designer ↔ Workflow API
Designer ↔ Engine
Designer ↔ Run API
Designer ↔ Usage API
Designer ↔ Live Events
```

Include registration, sign-in, multiple projects, workflow
create/save/load, run listing, historical versions, live observation,
input/output retrieval, AI usage, cost aggregation, retry cost
aggregation, and authorization rejection.

### Tenant Isolation Tests

Automated tests MUST attempt cross-tenant access to projects, workflows,
versions, runs, executions, inputs, outputs, logs, usage, cost, and
event streams, including explicit ID-tampering scenarios.

### End-to-End Test

At least one E2E test SHALL:

1.  Register a user.
2.  Sign in.
3.  Create a project.
4.  Create an AI-enabled workflow.
5.  Save it.
6.  Start it.
7.  Execute it with a connected worker.
8.  Record AI usage and cost.
9.  Display live node state.
10. Complete the workflow.
11. Display total run cost.
12. Open the AI node.
13. Display input/output.
14. Display token usage and usage events.
15. Display node cost.
16. Return to the run list.
17. Reopen the historical run and reproduce its execution graph.

A separate E2E security scenario SHALL verify tenant isolation.

## 36. Acceptance Criteria

The initial Drassos Designer SaaS milestone is complete when:

1.  Users can register, sign in, and sign out.
2.  Users can create multiple tenant-scoped projects.
3.  Projects can contain multiple workflows.
4.  Workflows can be visually created and edited.
5.  Definitions are persisted through Drassos Engine integration.
6.  Historical definition versions can support run visualization.
7.  Users can list all runs for a workflow.
8.  Users can open a run and see the graph used for that execution.
9.  Every node displays execution status.
10. Active graphs update live.
11. Clicking a node opens its runtime inspector.
12. The inspector displays structured input/output, logs, attempts,
    failures, and timing.
13. AI-agent nodes display execution cost directly on the graph.
14. AI-agent details display provider/model/token usage when available.
15. Run-level total cost is displayed.
16. Costs include billable failed/retried attempts.
17. Historical costs remain stable when provider pricing changes.
18. Project/workflow/run/step/attempt usage can be aggregated.
19. Unknown or partial costs are represented accurately.
20. Cross-tenant access is rejected.
21. Closing Designer does not interrupt active workflows.
22. Reopening a run reconstructs authoritative execution state.
23. Designer never directly executes workflow steps.
24. Cost is stored and transported as first-class observability data
    rather than merely calculated by the UI.

## 37. Suggested Implementation Phases

### Phase 1 --- SaaS Foundation

Registration, authentication, tenant/account model, projects, tenant
authorization, project navigation, and existing remote-engine
integration.

### Phase 2 --- Workflow Product Model

Project-scoped workflows, workflow list, visual editor, workflow
versions, definition persistence, and historical version retrieval.

### Phase 3 --- Run Explorer

Workflow/project run lists, run detail, historical graph reconstruction,
runtime node states, and live events.

### Phase 4 --- Runtime Inspector

Node selection, inputs, outputs, errors, attempts, logs, timing, and
worker details.

### Phase 5 --- Cost and Usage

Usage-event contract, Worker SDK reporting, AI usage capture, monetary
precision, attempt/node/run costs, AI node cost display, and usage
inspector.

### Phase 6 --- Cost Analytics

Workflow/project summaries, date filtering, model/provider breakdown,
token analytics, and cost trends.

### Phase 7 --- Team SaaS Features

Organizations, invitations, project memberships, roles, shared projects,
API keys, secrets, environments, usage limits, budgets, and billing.

## 38. Future Opportunities

The architecture SHOULD leave room for organizations, collaborative
editing, workflow comments, environments, project API keys, managed
workers, worker pools, secrets, usage budgets, cost alerts, anomaly
detection, optimization recommendations, per-agent budgets,
maximum-run-cost policies, model comparison, agent evaluation metrics,
OpenTelemetry, hosted engines, customer-hosted engines, enterprise SSO,
audit logs, and usage-based Drassos billing.

## 39. Key Product Invariant

Drassos Designer SHALL make a workflow understandable at three levels:

``` text
Definition
    What is supposed to happen?

Execution
    What actually happened?

Economics
    What did that execution consume and cost?
```

A user inspecting a run SHOULD be able to answer:

``` text
Which steps ran?
Which failed or retried?
Where is it waiting?
What went into each step?
What came out?
Which worker executed it?
How long did it take?
What did agents/models consume?
How much did each part cost?
How much did the entire run cost?
```

Cost, usage, status, timing, input/output, logs, and errors SHALL be
complementary dimensions of the same workflow execution.
