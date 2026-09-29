# Drassos Designer

Visual editor for Drassos workflow definitions. Designer talks to a small local server, and that server uses Drassos Engine for validation and durable execution.

## Run

From `drassos-designer`, with the engine dependencies installed in `../drassos-engine`:

```bash
pnpm install
pnpm dev
pnpm dev:ui
```

The server listens on http://127.0.0.1:3300. The UI listens on http://127.0.0.1:5174 and proxies `/api` to the server.

The sample application registers Order Processing and Approval, plus `orders.validate`, `payments.chargeCard`, `orders.reject`, and the `fraud.analyze` agent.

## Test

```bash
pnpm test
```

The server integration test starts an in-memory Drassos engine. Run it from the engine workspace if module resolution cannot see engine dependencies:

```bash
pnpm --dir ../drassos-engine exec vitest run ../drassos-designer/apps/designer-server/src/host.test.ts
```
