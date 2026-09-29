# Drassos Designer --- Remote Engine Connection Requirements

**Status:** Draft\
**Scope:** Drassos Designer\
**Purpose:** Allow Drassos Designer to connect to an existing Drassos
Engine server for workflow definition management, execution, testing,
debugging, and live observability.

## 1. Overview

Drassos Designer SHALL operate as a client of an existing Drassos Engine
server.

The Designer SHALL NOT require an embedded or in-process workflow engine
in order to design, inspect, test, execute, or debug workflows.

The primary architecture SHALL be:

``` text
┌───────────────────────────┐
│     Drassos Designer      │
│                           │
│ Visual Workflow Editor    │
│ Workflow Inspector        │
│ Run / Debug UI            │
│ Logs / Execution History  │
└─────────────┬─────────────┘
              │
              │ Control API
              │ Live Event Stream
              │
              ▼
┌───────────────────────────┐
│      Drassos Engine       │
│                           │
│ Workflow Definitions      │
│ Workflow Runtime          │
│ Scheduler                 │
│ Workers                   │
│ Execution History         │
└───────────────────────────┘
```

The Designer SHALL communicate with the engine exclusively through
public, versioned engine APIs.

This allows the Designer to connect equally to:

-   A local development engine.
-   A self-hosted engine.
-   A shared development/staging engine.
-   A remotely hosted Drassos Engine.
-   A future Drassos Cloud environment.

------------------------------------------------------------------------

# 2. Goals

The Designer SHALL:

1.  Connect to an existing Drassos Engine server.
2.  Authenticate with the server.
3.  Validate server and API compatibility.
4.  Browse workflow definitions registered with the server.
5.  Load workflow definitions into the visual Designer.
6.  Create new workflow definitions.
7.  Save workflow definitions to the remote engine.
8.  Support workflow-definition versioning.
9.  Validate workflows using the engine.
10. Start workflow runs from the Designer.
11. Supply workflow inputs.
12. Observe workflow execution in real time.
13. Display remote worker availability relevant to the workflow.
14. Display step logs and progress.
15. Inspect failures and execution attempts.
16. Send supported signals or human-input responses.
17. Cancel running workflows.
18. Reconnect safely after temporary network loss.
19. Clearly distinguish local unsaved state from remote persisted state.
20. Avoid any dependency on engine implementation internals.

------------------------------------------------------------------------

# 3. Non-Goals

The initial remote-engine integration does NOT need to provide:

-   Engine installation or provisioning.
-   Worker provisioning.
-   Cloud infrastructure deployment.
-   Engine database access.
-   Direct worker connections from the Designer.
-   Arbitrary administrative engine configuration.
-   Multi-engine workflow execution.
-   Collaborative simultaneous workflow editing.
-   Offline execution.
-   Production-grade source-control integration.
-   Full deployment/environment promotion workflows.

These MAY be added later.

------------------------------------------------------------------------

# 4. Connection Model

## 4.1 Engine Endpoint

The Designer SHALL allow the user to specify a Drassos Engine endpoint.

Examples:

``` text
http://localhost:8080
https://drassos.example.com
```

The Designer SHALL NOT assume that the engine is running on the same
machine.

------------------------------------------------------------------------

## 4.2 Connection Profiles

The Designer SHOULD support named connection profiles.

Example:

``` text
Local
    http://localhost:8080

Development
    https://drassos-dev.example.com

Production
    https://drassos.example.com
```

A profile SHOULD contain:

``` ts
interface EngineConnectionProfile {
  id: string;
  name: string;
  endpoint: string;
  authentication?: AuthenticationConfiguration;
}
```

Credentials and secrets SHALL NOT be stored directly inside workflow
definitions.

------------------------------------------------------------------------

## 4.3 Connection Status

The Designer SHALL prominently expose engine connection state.

At minimum:

``` text
DISCONNECTED
CONNECTING
CONNECTED
RECONNECTING
AUTHENTICATION_FAILED
INCOMPATIBLE
UNAVAILABLE
```

The user SHALL be able to determine which engine the Designer is
currently connected to.

------------------------------------------------------------------------

# 5. Connection Handshake

When connecting, the Designer SHALL retrieve engine metadata before
enabling remote operations.

The handshake SHOULD expose:

``` ts
interface EngineInfo {
  engineVersion: string;
  controlApiVersion: string;
  workflowSchemaVersions: string[];
  features: string[];
  serverId?: string;
  displayName?: string;
}
```

The Designer SHALL verify compatibility between:

-   Designer version.
-   Control API version.
-   Workflow-definition schema version.
-   Required engine capabilities.

If the engine is incompatible, the Designer SHALL explain the
incompatibility rather than failing with a generic network error.

------------------------------------------------------------------------

# 6. Authentication

The Designer SHALL support authenticated engine connections.

The initial implementation MAY support API tokens.

The architecture SHALL allow future authentication mechanisms such as:

-   OAuth/OIDC.
-   Browser-based login.
-   SSO.
-   Short-lived access tokens.
-   Organization/workspace credentials.

Authentication SHALL be handled by the engine's public API.

The Designer SHALL NOT communicate directly with the engine persistence
layer to bypass authorization.

------------------------------------------------------------------------

# 7. Workflow Browser

After connecting, the Designer SHALL allow the user to browse workflow
definitions available on the server.

The workflow browser SHALL display at minimum:

-   Workflow name.
-   Workflow ID.
-   Version.
-   Description where available.
-   Last modified time where available.

The user SHALL be able to:

-   Open a workflow.
-   Create a workflow.
-   Refresh the list.
-   Search/filter workflows.

Future versions MAY support folders, tags, projects, namespaces, or
environments.

------------------------------------------------------------------------

# 8. Loading a Workflow

When a remote workflow is opened, the Designer SHALL retrieve its
complete workflow definition through the Control API.

The workflow SHALL then be rendered into the Designer's visual graph.

The Designer SHALL NOT require the workflow to be executed before it can
be viewed.

The loaded definition SHALL include enough information to reconstruct:

-   Steps/nodes.
-   Connections/dependencies.
-   Step types.
-   Required worker capabilities.
-   Inputs.
-   Outputs.
-   Conditions.
-   Retry policies.
-   Timeout policies.
-   Human-interaction nodes.
-   Agent nodes.
-   Child workflows.
-   Workflow metadata.

Designer-specific layout metadata SHOULD be preserved where supported.

------------------------------------------------------------------------

# 9. Local Editing State

Opening a workflow SHALL create an editable local representation.

Changes SHALL NOT immediately mutate the remote definition unless
explicitly designed as an autosave mode.

The Designer SHALL track at least:

``` text
REMOTE VERSION
LOCAL CLEAN
LOCAL MODIFIED
SAVING
SAVE FAILED
VERSION CONFLICT
```

The UI SHALL clearly indicate unsaved changes.

------------------------------------------------------------------------

# 10. Saving Workflow Definitions

The Designer SHALL save workflow definitions through the engine's public
workflow-definition API.

The engine SHALL remain authoritative for persisted definitions.

A save operation SHOULD include the version/revision from which editing
began.

Example:

``` json
{
  "workflowId": "order-processing",
  "baseRevision": 17,
  "definition": {}
}
```

The engine SHOULD reject an update if the remote definition changed
since the Designer loaded it.

The Designer SHALL expose such a condition as a version conflict rather
than silently overwriting remote changes.

------------------------------------------------------------------------

# 11. Workflow Validation

The Designer SHALL support local structural validation where possible.

Examples:

-   Missing required properties.
-   Disconnected required nodes.
-   Invalid connections.
-   Invalid references.
-   Obvious graph cycles where prohibited.

The Designer SHALL ALSO be able to request authoritative validation from
the engine.

Engine validation MAY include:

-   Unsupported workflow schema.
-   Unknown step types.
-   Invalid expressions.
-   Missing referenced workflow.
-   Unsupported runtime feature.
-   Invalid retry/timeout configuration.
-   Missing required capabilities.

Validation errors SHALL be associated with the relevant workflow node or
property where possible.

------------------------------------------------------------------------

# 12. Worker Capability Awareness

The Designer SHALL be able to query the engine for currently registered
worker capabilities.

When editing a step requiring:

``` text
capability = "charge-card"
```

the Designer SHOULD be able to indicate whether an eligible worker is
currently connected.

Example:

``` text
Charge Card
Capability: charge-card

● 2 workers available
```

or:

``` text
Charge Card
Capability: charge-card

○ No connected worker currently provides this capability
```

Lack of a currently connected worker SHALL generally be treated as a
runtime availability warning rather than an invalid workflow definition.

Workers may connect later.

------------------------------------------------------------------------

# 13. Running Workflows

The Designer SHALL allow a user to start a workflow through the
connected engine.

Before starting, the Designer SHALL allow the user to provide workflow
inputs.

The engine SHALL create and return a workflow-run identifier.

Example:

``` text
workflowRunId: run_01K...
```

The Designer SHALL use that identifier for all subsequent run inspection
and debugging operations.

------------------------------------------------------------------------

# 14. Test Runs

The Designer SHOULD distinguish user-initiated Designer test runs from
ordinary production/application-started runs where the engine supports
such metadata.

Example:

``` json
{
  "source": "designer",
  "mode": "test"
}
```

A test run SHALL still use the real engine execution semantics and
worker infrastructure unless a separate simulation feature is explicitly
selected.

The Designer SHALL NOT pretend to execute workflow steps locally when
the connected engine is actually responsible for orchestration.

------------------------------------------------------------------------

# 15. Live Execution View

After starting or opening a workflow run, the Designer SHALL subscribe
to live execution events from the engine.

The visual graph SHALL update as execution progresses.

Example:

``` text
┌───────────────┐
│ Validate      │
│ ✓ Completed   │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Research      │
│ ● Running     │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Approval      │
│ ○ Pending     │
└───────────────┘
```

Visual states SHOULD include:

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
```

------------------------------------------------------------------------

# 16. Live Event Transport

The Designer SHOULD receive live execution updates without repeatedly
polling the engine.

The engine MAY expose:

-   WebSockets.
-   Server-Sent Events.
-   Another versioned streaming mechanism.

The Designer's internal execution model SHALL NOT depend directly on
transport-specific message formats.

A client/service abstraction SHOULD translate engine events into
Designer state updates.

------------------------------------------------------------------------

# 17. Logs

The Designer SHALL display logs associated with workflow execution.

Logs SHALL be retrievable for completed runs and streamable for active
runs.

The user SHOULD be able to select a workflow node and view logs for that
step.

Log information SHOULD include:

-   Timestamp.
-   Level.
-   Message.
-   Worker where useful.
-   Execution attempt.
-   Structured metadata where available.

The Designer SHOULD support filtering by log level.

------------------------------------------------------------------------

# 18. Step Inspector During Execution

Selecting a node during a workflow run SHALL expose runtime information.

The runtime inspector SHOULD include:

``` text
Status
Execution ID
Attempt
Assigned worker
Capability
Input
Output
Start time
End time
Duration
Error
Progress
Logs
```

The Designer SHALL clearly distinguish workflow-definition configuration
from runtime execution data.

------------------------------------------------------------------------

# 19. Execution Attempts

The Designer SHALL support inspecting multiple attempts when a step is
retried.

Example:

``` text
Charge Card

Attempt 1
FAILED
worker-12
Timeout

Attempt 2
COMPLETED
worker-07
```

Logs, errors, and timing SHALL remain associated with their individual
execution attempts.

------------------------------------------------------------------------

# 20. Workflow History

The Designer SHALL allow the user to view previous runs for the
currently open workflow.

At minimum, display:

-   Run ID.
-   Start time.
-   End time.
-   Status.
-   Duration.

Selecting a historical run SHALL overlay or display that execution state
against the workflow definition where compatible.

The Designer SHALL retrieve history from the engine rather than
maintaining its own authoritative execution-history database.

------------------------------------------------------------------------

# 21. Signals and Human Interaction

For workflow nodes waiting for signals or human input, the Designer
SHALL expose supported actions through the engine API.

Examples MAY include:

``` text
Approve
Reject
Resume
Send Signal
Provide Input
```

The Designer SHALL NOT directly modify workflow runtime state.

All state transitions SHALL occur through explicit engine commands.

------------------------------------------------------------------------

# 22. Cancellation

The Designer SHALL allow an authorized user to request cancellation of
an active workflow.

The UI SHALL distinguish:

``` text
Cancellation requested
```

from:

``` text
Workflow cancelled
```

because remote workers may require time to observe and respond to
cancellation.

------------------------------------------------------------------------

# 23. Network Interruption

Temporary Designer disconnection SHALL NOT affect workflow execution.

The workflow SHALL continue running on the engine independently of the
Designer.

Example:

``` text
Designer ─────X──── Engine ───── Worker
                         │
                         │ workflow continues
                         ▼
```

When connectivity returns, the Designer SHALL:

1.  Reconnect.
2.  Re-authenticate if necessary.
3.  Retrieve current workflow-run state.
4.  Retrieve events missed during disconnection where supported.
5.  Resume the live event subscription.
6.  Reconstruct the current visual execution state.

This behavior is a core requirement of the remote architecture.

------------------------------------------------------------------------

# 24. Engine Failure

If the engine becomes unavailable, the Designer SHALL preserve unsaved
local editing state.

The Designer SHALL clearly indicate that remote operations are
unavailable.

The Designer SHALL NOT imply that a save, workflow start, signal, or
cancellation succeeded unless acknowledged by the engine.

------------------------------------------------------------------------

# 25. Reconnection

The Designer SHOULD automatically attempt reconnection after transient
failures.

Automatic reconnection SHOULD use bounded/exponential backoff.

The user SHALL also have an explicit reconnect action.

Repeated failed reconnection attempts SHALL NOT destroy local workflow
edits.

------------------------------------------------------------------------

# 26. Connection Switching

If multiple engine profiles are supported, switching engines while a
workflow contains unsaved changes SHALL require the Designer to protect
those changes.

The Designer SHALL NOT silently discard local edits.

Remote workflow IDs SHALL NOT be assumed to identify identical
definitions across different engine servers.

------------------------------------------------------------------------

# 27. Designer Client Architecture

Remote engine communication SHOULD be isolated behind a dedicated client
layer.

Example:

``` text
Designer UI
    │
    ▼
Designer Application Services
    │
    ▼
@drassos/client
    │
    ├── Workflow Definitions API
    ├── Workflow Runs API
    ├── Workers API
    ├── Validation API
    └── Event Subscription
            │
            ▼
       Drassos Engine
```

Designer components SHALL NOT make arbitrary HTTP/WebSocket requests
directly.

This SHALL make engine protocol changes easier to manage and test.

------------------------------------------------------------------------

# 28. Shared Contracts

Where practical, Designer and Engine SHALL consume shared versioned
contracts from Drassos packages.

Example:

``` text
@drassos/core
    WorkflowDefinition
    WorkflowStep
    WorkflowSchema
    ExecutionEvent

@drassos/client
    EngineClient
    WorkflowClient
    RunClient
    WorkerClient
```

The Designer SHALL NOT import internal runtime classes from
`@drassos/engine`.

------------------------------------------------------------------------

# 29. Designer Modes

The Designer SHOULD conceptually separate two modes.

## Design Mode

Used for:

-   Creating workflows.
-   Editing nodes.
-   Connecting steps.
-   Configuring properties.
-   Validating.
-   Saving.

## Run/Debug Mode

Used for:

-   Starting workflows.
-   Viewing live state.
-   Inspecting step execution.
-   Viewing logs.
-   Inspecting attempts.
-   Sending signals.
-   Cancelling runs.

The same visual workflow graph MAY be reused by both modes.

------------------------------------------------------------------------

# 30. Connection UI

The Designer SHOULD provide a compact connection indicator in its main
interface.

Example:

``` text
Engine: Development ● Connected
```

Selecting it SHOULD expose useful connection details such as:

``` text
Profile: Development
Endpoint: https://drassos-dev.example.com
Engine Version: 0.x
Status: Connected
Workers: 6
```

Sensitive authentication information SHALL NOT be displayed.

------------------------------------------------------------------------

# 31. Open Workflow UX

A typical workflow SHALL be:

``` text
Launch Designer
      │
      ▼
Select Engine
      │
      ▼
Connect / Authenticate
      │
      ▼
Browse Workflows
      │
      ▼
Open Workflow
      │
      ▼
Edit / Validate
      │
      ├────────► Save
      │
      └────────► Run
                    │
                    ▼
              Live Debug View
```

The user SHOULD NOT need to understand the engine's process topology to
perform normal workflow-design tasks.

------------------------------------------------------------------------

# 32. API Operations Required by Designer

The Designer integration depends on the engine exposing operations
equivalent to:

``` text
GET    /engine/info

GET    /workflows
POST   /workflows
GET    /workflows/{id}
PUT    /workflows/{id}
GET    /workflows/{id}/versions
POST   /workflows/validate

POST   /workflows/{id}/runs
GET    /runs/{runId}
GET    /runs/{runId}/events
GET    /runs/{runId}/logs
POST   /runs/{runId}/cancel
POST   /runs/{runId}/signals

GET    /workers
GET    /workers/{workerId}

STREAM /events
```

Exact routes are implementation details and MAY differ.

The requirement is the availability of equivalent versioned
capabilities.

------------------------------------------------------------------------

# 33. Security Requirements

The Designer SHALL:

-   Use TLS for remote production engines.
-   Avoid logging authentication tokens.
-   Avoid embedding credentials in workflow definitions.
-   Respect engine authorization responses.
-   Avoid exposing secrets returned by APIs unless explicitly
    authorized.
-   Treat worker-produced logs and outputs as potentially sensitive
    data.
-   Avoid persisting credentials in plain text.

Credential storage SHOULD use platform-appropriate secure storage when
available.

------------------------------------------------------------------------

# 34. Conflict Handling

The Designer SHALL protect against accidental overwrites caused by
concurrent modification.

If the remote workflow revision differs from the revision originally
loaded, the Designer SHALL NOT silently overwrite it.

The initial UX MAY offer:

``` text
Reload Remote Version
Save As New Version
Review Conflict
```

Sophisticated graph merging is not required initially.

------------------------------------------------------------------------

# 35. Compatibility Handling

If a workflow contains nodes or features unsupported by the current
Designer version, the Designer SHALL preserve unknown data where
practical.

It SHALL NOT silently delete unsupported workflow properties during
save.

Unsupported nodes SHOULD render as recognizable placeholders with
compatibility information rather than causing the entire workflow to
fail to open.

------------------------------------------------------------------------

# 36. Performance Requirements

The Designer SHOULD remain responsive while remote requests are in
progress.

Network operations SHALL NOT block graph interaction unnecessarily.

Large execution logs SHOULD be paginated, streamed, virtualized, or
otherwise bounded.

Opening a workflow SHOULD NOT require downloading unrelated workflow
histories or logs.

------------------------------------------------------------------------

# 37. Required Automated Tests

## Unit Tests

Unit tests SHALL cover:

-   Connection state transitions.
-   Engine compatibility checks.
-   Local dirty-state tracking.
-   Remote revision tracking.
-   Conflict detection.
-   Event-to-visual-state mapping.
-   Retry-attempt visualization.
-   Connection-profile behavior.
-   Capability availability mapping.

## Integration Tests

Integration tests SHALL cover:

``` text
Designer Client ↔ Engine API
Designer Event Client ↔ Engine Event Stream
Designer ↔ Authentication
```

Required scenarios include:

-   Successful connection.
-   Invalid endpoint.
-   Authentication failure.
-   Incompatible API version.
-   Workflow listing.
-   Workflow loading.
-   Workflow saving.
-   Validation failure.
-   Version conflict.
-   Workflow start.
-   Live execution events.
-   Log streaming.
-   Cancellation.
-   Signal submission.
-   Network disconnect and reconnect.

## End-to-End Tests

At least one E2E test SHALL:

1.  Start a real Drassos Engine server.
2.  Start at least one worker.
3.  Launch the Designer.
4.  Connect the Designer to the engine.
5.  Load or create a workflow.
6.  Save the workflow to the engine.
7.  Start the workflow from the Designer.
8.  Observe step execution visually.
9.  Observe worker logs.
10. Verify workflow completion.
11. Open the completed run from execution history.

A second E2E scenario SHOULD disconnect the Designer during execution,
allow the workflow to continue, reconnect the Designer, and verify that
the current execution state is reconstructed correctly.

------------------------------------------------------------------------

# 38. Acceptance Criteria

The remote-engine Designer milestone is complete when:

1.  The Designer can start without running an embedded Drassos Engine.
2.  A user can configure a remote engine URL.
3.  The Designer can connect and authenticate.
4.  The Designer verifies engine/API compatibility.
5.  The Designer can list registered workflow definitions.
6.  The Designer can open a remote definition visually.
7.  The Designer can modify the workflow locally.
8.  Unsaved changes are clearly indicated.
9.  The Designer can validate the workflow against the remote engine.
10. The Designer can save changes to the engine.
11. Conflicting remote modifications are detected.
12. The Designer can create a new workflow definition.
13. The Designer can query worker/capability availability.
14. The Designer can start a workflow run.
15. The Designer can provide workflow input.
16. The graph displays live execution state.
17. The Designer displays worker-generated logs.
18. The Designer displays step inputs, outputs, failures, and attempts.
19. The Designer can inspect historical workflow runs.
20. The Designer can send supported workflow signals.
21. The Designer can request workflow cancellation.
22. Closing or disconnecting the Designer does not interrupt the
    workflow.
23. The Designer can reconnect to an active run and reconstruct its
    current state.
24. Engine unavailability does not destroy unsaved local edits.
25. All engine interaction occurs through versioned public APIs rather
    than engine internals.

------------------------------------------------------------------------

# 39. Suggested Implementation Phases

## Phase 1 --- Remote Connection

-   Engine connection configuration.
-   Connection profiles.
-   Authentication.
-   Engine metadata handshake.
-   Compatibility validation.
-   Connection-state UI.
-   `@drassos/client` integration.

## Phase 2 --- Remote Definitions

-   Browse definitions.
-   Load definitions.
-   Create definitions.
-   Save definitions.
-   Dirty-state tracking.
-   Revision/conflict handling.
-   Engine-side validation.

## Phase 3 --- Remote Execution

-   Run workflow.
-   Workflow inputs.
-   Retrieve run state.
-   Cancel workflow.
-   Execution-history browser.

## Phase 4 --- Live Debugging

-   Event-stream connection.
-   Live graph-state visualization.
-   Step runtime inspector.
-   Streaming logs.
-   Progress events.
-   Execution-attempt inspection.

## Phase 5 --- Resilience and UX

-   Automatic reconnection.
-   Missed-event recovery.
-   Active-run reconstruction.
-   Better compatibility handling.
-   Multiple connection profiles.
-   Capability/worker availability indicators.

------------------------------------------------------------------------

# 40. Key Architectural Invariants

The Designer SHALL remain a client of the Drassos Engine.

``` text
Designer
    defines, visualizes, tests, and observes workflows

Engine
    persists, orchestrates, schedules, and controls workflows

Workers
    execute workflow steps
```

The Designer SHALL NOT:

-   Execute workflow steps itself.
-   Directly schedule workers.
-   Directly communicate with workers.
-   Mutate workflow runtime state outside engine commands.
-   Depend on the engine's internal persistence implementation.

A Designer session MAY disappear at any time without affecting workflow
correctness.

The engine SHALL remain authoritative for persisted workflow definitions
and workflow execution state.
