# Drassos Designer v0.1 --- Requirements Specification

**Product:** Drassos Designer\
**Version:** v0.1\
**Status:** Draft\
**Depends on:** Drassos Engine Workflow Definitions

## 1. Overview

Drassos Designer is a developer-focused visual environment for
designing, implementing, validating, running, testing, and eventually
debugging Drassos workflows.

Version 0.1 establishes the first complete vertical slice:

> **Visually create a workflow, configure it using capabilities exposed
> by Drassos Engine, save it as a canonical `WorkflowDefinition`,
> validate it, execute it, and observe the execution directly on the
> workflow graph.**

Drassos Designer MUST be an external consumer of Drassos Engine rather
than a UI subsystem embedded into the engine.

``` text
┌─────────────────────────────────────────────┐
│              Drassos Designer               │
│                                             │
│  Canvas   Properties   Validation   Run UI  │
└──────────────────────┬──────────────────────┘
                       │
                       │ Drassos APIs
                       ▼
┌─────────────────────────────────────────────┐
│               drassos-engine                │
│                                             │
│ Definitions │ Registry │ Runtime │ Events   │
└─────────────────────────────────────────────┘
```

The Designer MUST operate on the same workflow-definition format that
can be authored programmatically.

There MUST NOT be a separate "Designer workflow" execution model.

------------------------------------------------------------------------

## 2. Product Goals

v0.1 MUST allow a developer to:

1.  Connect Designer to a Drassos development environment.
2.  Discover registered workflow definitions.
3.  Open an existing workflow definition.
4.  Create a new workflow definition.
5.  Build and modify the workflow using drag-and-drop.
6.  Configure nodes through a property editor.
7.  Select registered Drassos capabilities such as activities and
    agents.
8.  Connect nodes visually.
9.  Configure basic data mappings.
10. Validate the workflow before execution.
11. Save workflow definitions.
12. Run a workflow with user-provided input.
13. Watch workflow execution progress on the canvas.
14. Inspect node inputs, outputs, status, duration, and errors.
15. Inspect the execution event timeline.

The result should already be useful as a lightweight workflow
development environment even before advanced debugging features are
introduced.

------------------------------------------------------------------------

## 3. Non-Goals

v0.1 does NOT require:

-   BPMN compatibility.
-   Collaborative editing.
-   Multi-user editing.
-   Production deployment management.
-   Production workflow administration.
-   Authentication/authorization beyond what is necessary for local
    development.
-   Git integration.
-   Visual source control or diffing.
-   Arbitrary TypeScript editing inside Designer.
-   Full workflow code generation.
-   AI-assisted workflow generation.
-   Breakpoints.
-   Step-through debugging.
-   Time-travel debugging.
-   Execution replay.
-   Failure injection.
-   Mocking framework.
-   Full test-suite management.
-   Plugin marketplace.
-   Custom visual node plugins.
-   Mobile/tablet editing.
-   Hosted SaaS infrastructure.

These can be introduced incrementally after the core Designer/Engine
contract is proven.

------------------------------------------------------------------------

## 4. Primary User

The primary v0.1 user is a software developer building an application
with Drassos.

Designer is NOT intended to hide software-development concepts.

The UI SHOULD expose concepts such as:

-   workflow inputs
-   activities
-   agents
-   signals
-   retries
-   timeouts
-   node outputs
-   execution IDs
-   validation errors
-   event history

The initial product should favor developer clarity and inspectability
over low-code abstraction.

------------------------------------------------------------------------

## 5. Core Product Model

Designer operates on the canonical Drassos `WorkflowDefinition`.

``` text
              ┌───────────────┐
              │    Designer   │
              └───────┬───────┘
                      │
                      ▼
             WorkflowDefinition
                      │
             ┌────────┴────────┐
             │                 │
             ▼                 ▼
        Validation         Execution
             │                 │
             └────────┬────────┘
                      ▼
               Drassos Engine
```

Designer MUST NOT introduce execution semantics that cannot be
represented in `WorkflowDefinition`.

A saved workflow MUST be executable without Designer.

------------------------------------------------------------------------

# 6. Application Layout

The initial interface SHOULD use a desktop IDE-style layout.

``` text
┌──────────────────────────────────────────────────────────────────────────┐
│ Drassos Designer       Order Fulfillment             Save   ▶ Run       │
├──────────────┬────────────────────────────────────────┬──────────────────┤
│              │                                        │                  │
│ WORKFLOWS    │                                        │ PROPERTIES       │
│              │                                        │                  │
│ Order        │                                        │ Activity         │
│ Fulfillment  │            WORKFLOW CANVAS             │                  │
│              │                                        │ orders.validate  │
│ Refund       │                                        │                  │
│              │                                        │ Input Mapping    │
│              │                                        │ Retry            │
│ PALETTE      │                                        │ Timeout          │
│              │                                        │                  │
│ Start        │                                        │                  │
│ Activity     │                                        │                  │
│ Agent        │                                        │                  │
│ Condition    │                                        │                  │
│ Wait         │                                        │                  │
│ Signal       │                                        │                  │
│ Child WF     │                                        │                  │
│ End          │                                        │                  │
├──────────────┴────────────────────────────────────────┴──────────────────┤
│ Problems │ Execution │ Events │ Output                                  │
└──────────────────────────────────────────────────────────────────────────┘
```

The major regions are:

-   Workflow Explorer
-   Node Palette
-   Workflow Canvas
-   Properties Panel
-   Bottom Panel
-   Application Toolbar

------------------------------------------------------------------------

# 7. Workflow Explorer

The Workflow Explorer displays workflow definitions exposed by the
connected Drassos environment.

Example:

``` text
WORKFLOWS

▾ Orders
   Order Fulfillment
   Cancel Order
   Refund Order

▾ Customers
   Customer Onboarding
```

At minimum each entry SHOULD expose:

-   workflow name
-   workflow ID
-   workflow version

The explorer MUST support:

-   refresh
-   open workflow
-   create workflow

Search/filtering is desirable but not required for v0.1.

Opening a workflow loads its `WorkflowDefinition` onto the canvas.

------------------------------------------------------------------------

# 8. Create Workflow

The user MUST be able to create a new workflow.

Required fields:

``` text
Name
Workflow ID
Version
Description (optional)
```

Example:

``` text
Name:       Order Fulfillment
ID:         order-fulfillment
Version:    1.0.0
Description: Processes a customer order.
```

A newly created workflow SHOULD initially contain:

``` text
Start → End
```

or an empty canvas with automatic Start/End creation.

Designer MUST ensure that the resulting definition satisfies the Drassos
definition schema.

------------------------------------------------------------------------

# 9. Workflow Canvas

The canvas is the primary editing surface.

The canvas MUST support:

-   pan
-   zoom
-   select node
-   move node
-   add node through drag-and-drop
-   connect nodes
-   delete node
-   delete edge
-   select edge
-   fit workflow to viewport

Nice-to-have:

-   multi-select
-   keyboard delete
-   copy/paste
-   undo/redo

Undo/redo SHOULD be included if practical because workflow editing
errors are otherwise unnecessarily destructive.

------------------------------------------------------------------------

# 10. Node Palette

The palette contains workflow node types supported by the connected
Drassos version.

v0.1 SHOULD support:

``` text
Start
End
Activity
Agent
Condition
Wait
Signal
Child Workflow
```

Users drag a node from the palette onto the canvas.

Example:

``` text
PALETTE

Flow
 ├─ Start
 ├─ End
 └─ Condition

Execution
 ├─ Activity
 ├─ Agent
 └─ Child Workflow

Durability
 ├─ Wait
 └─ Signal
```

Node categories are UI organization only and MUST NOT affect engine
semantics.

------------------------------------------------------------------------

# 11. Canvas Nodes

Nodes SHOULD provide enough information to understand the workflow
without opening the properties panel.

Example activity:

``` text
┌──────────────────────────┐
│ Activity                 │
│                          │
│ Validate Order           │
│ orders.validate          │
└────────────┬─────────────┘
             │
```

Example agent:

``` text
┌──────────────────────────┐
│ Agent                    │
│                          │
│ Fraud Analysis           │
│ fraud.analyze            │
└────────────┬─────────────┘
             │
```

Example condition:

``` text
        ┌───────────────────┐
        │ Risk Accepted?    │
        └───────┬─────┬─────┘
                │     │
             true     false
```

Each visual node MUST map to exactly one `WorkflowNode`.

Canvas node identity MUST use the stable `nodeId` from the workflow
definition.

------------------------------------------------------------------------

# 12. Edges

Users MUST be able to create edges by connecting compatible node ports.

Designer MUST prevent obviously invalid connections where possible.

Example:

``` text
Validate
   │
   ▼
Fraud Check
   │
   ▼
Risk Accepted?
  / \
 /   \
yes   no
```

Designer SHOULD visually distinguish conditional outputs.

Deleting an edge MUST update the underlying `WorkflowDefinition`.

------------------------------------------------------------------------

# 13. Properties Panel

Selecting a node opens its configuration in the properties panel.

Common properties:

``` text
Name
Node ID
Type
```

Type-specific properties appear below.

------------------------------------------------------------------------

# 14. Activity Configuration

Selecting an Activity node MUST allow the user to choose a registered
Drassos activity.

Example:

``` text
ACTIVITY

Name
Validate Order

Implementation
[ orders.validate ▼ ]

Input Mapping
─────────────────
orderId
  ← workflow.input.orderId

Retry
─────────────────
Enabled      [✓]
Attempts      3

Timeout
─────────────────
30 seconds
```

The activity dropdown MUST be populated through Drassos capability
discovery rather than hard-coded configuration.

------------------------------------------------------------------------

# 15. Agent Configuration

Agent configuration SHOULD behave similarly.

``` text
AGENT

Name
Fraud Analysis

Agent
[ fraud.analyze ▼ ]

Input Mapping
─────────────────
order
  ← validate.output

Retry
─────────────────
Attempts: 2

Timeout
─────────────────
60 seconds
```

Designer SHOULD display the agent's declared input/output schema when
available.

------------------------------------------------------------------------

# 16. Condition Configuration

The condition editor MUST support the expression capabilities provided
by the initial Workflow Definition implementation.

The UI SHOULD avoid asking users to type serialized expression
structures manually.

Example:

``` text
CONDITION

Left
[ Fraud Analysis ] [ riskScore ]

Operator
[ less than ▼ ]

Right
[ literal ▼ ] [ 0.7 ]
```

Which produces a declarative expression equivalent to:

``` json
{
  "type": "comparison",
  "operator": "lt",
  "left": {
    "source": "node",
    "nodeId": "fraud-analysis",
    "path": "riskScore"
  },
  "right": {
    "source": "literal",
    "value": 0.7
  }
}
```

------------------------------------------------------------------------

# 17. Data Mapping Editor

Designer MUST provide a basic UI for mapping workflow/node data into
node inputs.

Users SHOULD be able to select from known sources rather than manually
type JSON paths whenever schema information exists.

Potential sources include:

``` text
Workflow Input
Previous Node Output
Workflow State
Literal Value
```

Example:

``` text
orderId

Source:
[ Workflow Input ▼ ]

Field:
[ orderId ▼ ]
```

For node output:

``` text
riskScore

Source:
[ Node Output ▼ ]

Node:
[ Fraud Analysis ▼ ]

Field:
[ riskScore ▼ ]
```

The resulting mapping MUST use the canonical Drassos `ValueReference`
representation.

------------------------------------------------------------------------

# 18. Workflow Inputs and Outputs

Designer MUST provide a workflow-level properties view.

Example:

``` text
WORKFLOW

Name
Order Fulfillment

ID
order-fulfillment

Version
1.0.0

INPUTS
─────────────────
orderId     string
customerId  string

OUTPUTS
─────────────────
confirmationId string
```

v0.1 only needs to support the primitive/schema types supported by the
first Workflow Definition implementation.

------------------------------------------------------------------------

# 19. Validation

Designer MUST call Drassos workflow validation.

Validation SHOULD occur:

-   when explicitly requested
-   before execution
-   optionally after edits using debounce

Diagnostics MUST appear in a Problems panel.

Example:

``` text
PROBLEMS

✕ charge-card
  Unknown activity "payments.chargeCard"

✕ edge-17
  Target node does not exist.

⚠ cleanup
  Node is unreachable.
```

Selecting a diagnostic SHOULD select and focus the corresponding node or
edge when one is available.

Nodes containing errors SHOULD receive a visible error indicator on the
canvas.

Designer SHOULD NOT duplicate engine validation rules unnecessarily.

The engine validator remains authoritative.

------------------------------------------------------------------------

# 20. Saving

Designer MUST be able to save the current workflow as a canonical
`WorkflowDefinition`.

Saving MUST preserve:

-   semantic definition
-   workflow metadata
-   Designer layout metadata

Example Designer metadata:

``` json
{
  "metadata": {
    "designer": {
      "nodes": {
        "validate": {
          "x": 380,
          "y": 220
        }
      }
    }
  }
}
```

Layout information MUST NOT influence execution.

------------------------------------------------------------------------

# 21. Unsaved Changes

Designer MUST track whether the current definition differs from its last
saved version.

Example:

``` text
Order Fulfillment *
```

Navigating away from an unsaved workflow SHOULD prompt the user before
discarding changes.

------------------------------------------------------------------------

# 22. Running a Workflow

The toolbar MUST provide a Run action.

Before execution:

1.  Save or prepare the current definition.
2.  Validate the workflow.
3.  If validation contains errors, do not start execution.
4.  Prompt for workflow input.

Example:

``` text
RUN WORKFLOW

orderId
[ ORD-1234 ]

customerId
[ CUST-98 ]

               [ Cancel ] [ Run ]
```

Designer then starts an execution through Drassos Engine.

------------------------------------------------------------------------

# 23. Execution Mode

Once execution begins, the canvas SHOULD switch into an execution
visualization mode.

Example states:

``` text
○ Not Started
● Running
✓ Completed
✕ Failed
◷ Waiting
↻ Retrying
```

The graph might appear conceptually as:

``` text
✓ Validate Order
       │
       ▼
✓ Fraud Analysis
       │
       ▼
✓ Risk Accepted?
       │
       ▼
● Charge Card
       │
       ▼
○ Ship Order
```

Execution visualization MUST be driven by Drassos runtime events, not
inferred solely by the browser.

------------------------------------------------------------------------

# 24. Execution Event Contract

Designer needs a stream or subscription mechanism for execution events.

The engine-facing integration SHOULD expose events containing at least:

``` ts
interface DesignerExecutionEvent {
  executionId: string;
  workflowId: string;
  workflowVersion: string;

  nodeId?: string;

  type: string;
  timestamp: string;

  data?: unknown;
}
```

Relevant event categories include:

``` text
WorkflowStarted
WorkflowCompleted
WorkflowFailed

NodeScheduled
NodeStarted
NodeCompleted
NodeFailed
NodeWaiting
NodeRetrying

SignalReceived
```

Existing Drassos event types SHOULD be reused wherever possible.

Designer SHOULD NOT introduce a second runtime event model if the
existing engine event model can support the UI.

------------------------------------------------------------------------

# 25. Node Execution Inspection

While viewing a run, selecting a node MUST expose execution details.

Example:

``` text
VALIDATE ORDER

Status
Completed

Duration
43 ms

Attempts
1

INPUT
──────────────────
{
  "orderId": "ORD-1234"
}

OUTPUT
──────────────────
{
  "valid": true,
  "total": 149.99
}
```

Failed nodes SHOULD expose error information.

``` text
ERROR
──────────────────
PaymentGatewayUnavailable

The payment provider did not respond.
```

Sensitive-data handling should follow Drassos runtime/logging policies;
Designer MUST NOT create additional unrestricted logging of node inputs
and outputs.

------------------------------------------------------------------------

# 26. Execution Timeline

The bottom panel MUST contain an Events view.

Example:

``` text
12:04:01.003  WorkflowStarted

12:04:01.012  ValidateOrder Started
12:04:01.055  ValidateOrder Completed

12:04:01.061  FraudAnalysis Started
12:04:01.428  FraudAnalysis Completed

12:04:01.431  ChargeCard Started
```

Selecting an event SHOULD focus its corresponding node when `nodeId`
exists.

The timeline MUST preserve engine event ordering.

------------------------------------------------------------------------

# 27. Execution Output

The Output panel SHOULD display the workflow result after completion.

Example:

``` json
{
  "confirmationId": "CONF-88392",
  "status": "completed"
}
```

If the workflow fails, the Output panel SHOULD instead make the failure
clearly visible.

------------------------------------------------------------------------

# 28. Waiting Workflows

Because Drassos supports durable execution, Designer MUST correctly
represent workflows that enter a waiting state.

Example:

``` text
✓ Create Request
       │
       ▼
◷ Wait for Approval
       │
       ▼
○ Process Approval
```

The UI MUST NOT assume that a workflow run completes during the current
browser session.

Designer SHOULD be able to reconnect to an existing execution and
reconstruct its current visual state from Drassos execution
state/history.

------------------------------------------------------------------------

# 29. Designer Backend

v0.1 SHOULD use a small Designer backend/server between the browser and
Drassos Engine.

``` text
Browser
   │
   │ HTTP / WebSocket
   ▼
Designer Server
   │
   │ Drassos APIs
   ▼
Application / Drassos Engine
```

Responsibilities MAY include:

-   serving the Designer application
-   workflow discovery
-   capability discovery
-   loading definitions
-   saving definitions
-   validation requests
-   starting executions
-   retrieving execution details
-   streaming execution events

The backend MUST NOT duplicate workflow execution logic.

------------------------------------------------------------------------

# 30. Engine Adapter

Designer SHOULD isolate Drassos integration behind an adapter/interface.

Example:

``` ts
interface DrassosDesignerClient {
  listWorkflows(): Promise<WorkflowSummary[]>;

  getWorkflow(
    id: string,
    version?: string
  ): Promise<WorkflowDefinition>;

  saveWorkflow(
    definition: WorkflowDefinition
  ): Promise<void>;

  validateWorkflow(
    definition: WorkflowDefinition
  ): Promise<WorkflowDiagnostic[]>;

  listActivities(): Promise<CapabilityDescriptor[]>;

  listAgents(): Promise<CapabilityDescriptor[]>;

  runWorkflow(
    request: RunWorkflowRequest
  ): Promise<WorkflowExecution>;

  getExecution(
    executionId: string
  ): Promise<WorkflowExecution>;

  subscribeToExecution(
    executionId: string
  ): AsyncIterable<WorkflowExecutionEvent>;
}
```

Exact API naming may differ.

This boundary makes it possible to evolve transport without coupling
canvas components directly to Drassos runtime APIs.

------------------------------------------------------------------------

# 31. Technology Direction

The UI SHOULD be implemented as a modern TypeScript web application.

Recommended baseline:

``` text
React
TypeScript
Vite
React Flow / XYFlow
```

A graph/canvas library SHOULD handle:

-   node positioning
-   edges
-   ports/handles
-   pan
-   zoom
-   selection
-   drag-and-drop

Drassos-specific workflow semantics MUST remain in Designer application
code rather than being delegated to the graph library.

The initial application SHOULD remain web-based so it can later run:

-   locally
-   embedded in developer tooling
-   against remote Drassos environments
-   potentially inside a desktop shell if desired

------------------------------------------------------------------------

# 32. Local Development Experience

Running Designer against a Drassos application SHOULD eventually be as
simple as:

``` bash
npx drassos-designer
```

or:

``` bash
drassos designer
```

The exact command is not required to be finalized in v0.1, but
architecture SHOULD support this experience.

A developer should not have to manually configure REST endpoints for
every registered activity or workflow.

------------------------------------------------------------------------

# 33. Definition Synchronization

Designer MUST avoid silently overwriting newer workflow definitions.

At minimum, save operations SHOULD carry enough version/revision
information to detect stale writes.

For v0.1 this MAY be a simple revision token.

Example:

``` ts
{
  workflowId: "order-fulfillment",
  version: "1.0.0",
  revision: "abc123"
}
```

If the definition has changed since Designer loaded it, Designer SHOULD
report a conflict rather than overwrite it automatically.

Full collaborative merging is out of scope.

------------------------------------------------------------------------

# 34. Error Handling

Designer MUST handle:

-   engine unavailable
-   workflow load failure
-   workflow save failure
-   invalid definition
-   missing capability
-   execution start failure
-   execution runtime failure
-   lost event-stream connection
-   stale definition conflict

Errors SHOULD identify whether the problem originated from:

``` text
Designer
Definition Validation
Designer Server
Drassos Engine
Application Capability
```

where that distinction is known.

------------------------------------------------------------------------

# 35. Reconnection

If the execution event connection is lost, Designer SHOULD reconnect and
request current execution state/history.

The UI MUST NOT assume that missing live events mean the workflow
stopped executing.

Conceptually:

``` text
Live events disconnected
        │
        ▼
Reconnect
        │
        ▼
Load execution state/history
        │
        ▼
Reconstruct graph state
        │
        ▼
Resume live events
```

------------------------------------------------------------------------

# 36. Persistence

v0.1 SHOULD avoid introducing a separate Designer workflow database
unless necessary.

Workflow definitions SHOULD remain owned by the Drassos
application/engine integration.

Designer-specific preferences MAY be stored locally.

Examples:

``` text
panel sizes
last opened workflow
canvas zoom
theme
```

Workflow canvas positions SHOULD travel with workflow metadata so
another Designer instance can reproduce the layout.

------------------------------------------------------------------------

# 37. Security

Designer is a privileged development tool.

Even in v0.1:

-   Workflow definitions MUST be treated as data.
-   Designer MUST NOT evaluate JavaScript stored in definitions.
-   Capability selectors MUST use capabilities exposed by the connected
    Drassos application.
-   A workflow definition MUST NOT specify arbitrary modules to load.
-   Node configuration MUST follow Drassos schemas.
-   Error displays SHOULD avoid exposing secrets.
-   Designer SHOULD not independently persist secrets contained in
    workflow input.
-   Runtime credentials remain the responsibility of the host
    application/Drassos environment.

------------------------------------------------------------------------

# 38. Testing Requirements

## Unit Tests

Cover:

-   definition-to-canvas conversion
-   canvas-to-definition updates
-   node creation
-   node deletion
-   edge creation/deletion
-   property editing
-   data mapping
-   condition editing
-   layout metadata
-   validation display
-   execution-state projection
-   event-to-node correlation

## Component Tests

Cover:

-   node palette
-   workflow explorer
-   canvas
-   properties panel
-   run dialog
-   problems panel
-   event timeline
-   node execution inspector

## Integration Tests

Cover:

``` text
Load → Edit → Validate → Save
```

and:

``` text
Load → Run → Observe → Inspect
```

and:

``` text
Create → Add Nodes → Connect → Configure → Save → Run
```

## End-to-End Tests

At least one real Drassos test application SHOULD be started and
controlled through Designer.

The primary E2E scenario SHOULD create or load:

``` text
Start
  │
  ▼
Activity
  │
  ▼
Condition
 /       \
▼         ▼
Activity  Agent
 \         /
  ▼       ▼
     End
```

The test MUST verify that the visual state matches the actual Drassos
execution.

Regression fixes MUST include automated tests where practical.

------------------------------------------------------------------------

# 39. Sample Application

The Designer repository SHOULD include or reference a small Drassos
sample application specifically for development and E2E testing.

Suggested sample:

``` text
Order Processing

Start
  │
  ▼
Validate Order
  │
  ▼
Fraud Analysis
  │
  ▼
Risk Accepted?
 /           \
yes           no
 │             │
 ▼             ▼
Charge Card   Reject Order
 │
 ▼
End
```

The sample SHOULD expose:

-   at least two activities
-   one agent
-   one condition
-   input/output schemas
-   one intentional failure mode

This becomes the baseline demo for v0.1.

------------------------------------------------------------------------

# 40. UX Requirements

The application SHOULD feel like a developer tool rather than a generic
diagram editor.

Important UX principles:

### Immediate correspondence

Changes on the canvas must correspond directly to changes in the
workflow definition.

### Inspectability

A developer should be able to answer:

``` text
What is this node?
What implementation does it call?
What data goes into it?
What came out?
Why did it fail?
What executes next?
```

without leaving the Designer.

### Progressive detail

The graph shows structure.

The properties panel shows configuration.

The bottom panel shows diagnostics/runtime details.

### Engine truth

When Designer and Drassos disagree about validity or runtime state,
Drassos Engine is authoritative.

------------------------------------------------------------------------

# 41. Performance Targets

v0.1 SHOULD remain responsive for workflows containing approximately:

``` text
100 nodes
200 edges
```

Basic canvas interactions SHOULD remain interactive at this size.

Large-scale graph optimization beyond this target is not required for
v0.1.

------------------------------------------------------------------------

# 42. Repository / Package Structure

A possible repository structure:

``` text
drassos-designer/
│
├── apps/
│   ├── designer/
│   └── designer-server/
│
├── packages/
│   ├── designer-client/
│   ├── workflow-canvas/
│   └── ui/
│
├── examples/
│   └── order-processing/
│
└── tests/
    └── e2e/
```

Do not over-package v0.1 unnecessarily.

The primary architectural boundary that matters is:

``` text
Designer UI
     │
Designer integration/client
     │
Drassos Engine
```

------------------------------------------------------------------------

# 43. Suggested Implementation Phases

## Phase 1 --- Read-Only Visualization

-   Create Designer application shell.
-   Connect to Drassos.
-   Discover workflows.
-   Load `WorkflowDefinition`.
-   Render nodes and edges.
-   Display workflow/node properties.
-   Restore Designer layout metadata.

At this point Designer becomes a useful workflow viewer.

## Phase 2 --- Visual Editing

-   Add node palette.
-   Drag nodes onto canvas.
-   Connect nodes.
-   Delete nodes/edges.
-   Edit properties.
-   Configure activities and agents from registry.
-   Configure data mappings.
-   Configure conditions.
-   Save definitions.
-   Track unsaved changes.

At this point Designer becomes a workflow authoring tool.

## Phase 3 --- Validation

-   Integrate engine validation.
-   Add Problems panel.
-   Add canvas error indicators.
-   Navigate from diagnostic to graph element.
-   Prevent invalid workflow execution.

## Phase 4 --- Execution

-   Add Run dialog.
-   Generate input form from workflow input schema.
-   Start execution.
-   Receive runtime events.
-   Project execution state onto canvas.

## Phase 5 --- Inspection

-   Add node execution inspector.
-   Add Events timeline.
-   Add workflow output.
-   Display failures and retries.
-   Handle waiting workflows.
-   Add reconnect/reconstruction behavior.

## Phase 6 --- Hardening

-   E2E tests.
-   stale-write protection
-   error handling
-   performance testing
-   sample workflow
-   documentation

------------------------------------------------------------------------

# 44. Acceptance Criteria

Drassos Designer v0.1 is complete when a developer can:

1.  Start Designer against a Drassos development application.
2.  See registered workflow definitions without running them.
3.  Open a workflow and see its complete graph.
4.  Create a new workflow.
5.  Drag supported node types onto the canvas.
6.  Connect and remove nodes/edges.
7.  Select registered activities and agents.
8.  Configure basic input mappings.
9.  Configure a basic condition.
10. Edit workflow inputs and outputs.
11. Save the workflow as a canonical `WorkflowDefinition`.
12. Reopen the workflow with its canvas layout intact.
13. See structured validation errors.
14. Navigate from validation errors to affected nodes.
15. Supply workflow input and start an execution.
16. Watch node status change based on real Drassos runtime events.
17. Select a node and inspect its execution input/output/status/error.
18. Inspect the ordered workflow event timeline.
19. See the final workflow output.
20. Leave and later reconnect to a durable execution without corrupting
    its displayed state.

The complete path MUST work:

``` text
Create
   ↓
Design
   ↓
Configure
   ↓
Validate
   ↓
Save
   ↓
Run
   ↓
Observe
   ↓
Inspect
```

------------------------------------------------------------------------

# 45. Definition of the v0.1 Product Boundary

The central product boundary for v0.1 is:

``` text
                 DRASSOS DESIGNER

        ┌─────────────────────────────┐
        │ Visual representation      │
        │ Editing                    │
        │ Developer interaction      │
        │ Runtime visualization      │
        └──────────────┬──────────────┘
                       │
              WorkflowDefinition
              Capabilities
              Validation
              Execution Events
                       │
                       ▼
                 DRASSOS ENGINE

        ┌─────────────────────────────┐
        │ Workflow semantics          │
        │ Durable execution           │
        │ Validation rules            │
        │ Runtime state               │
        │ Capability execution        │
        └─────────────────────────────┘
```

Designer owns **how developers see and manipulate workflows**.

Drassos Engine owns **what workflows mean and how they execute**.

Maintaining that boundary is a primary architectural requirement of
Drassos Designer.
