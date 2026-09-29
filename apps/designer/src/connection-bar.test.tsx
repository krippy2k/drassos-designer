/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionBar } from "@drassos/designer-ui";

afterEach(() => {
  cleanup();
});

describe("designer connection bar", () => {
  it("shows the connected engine and keeps the endpoint editable", () => {
    const onConnect = vi.fn();
    render(
      <ConnectionBar
        status="CONNECTED"
        endpoint="http://127.0.0.1:3100"
        info={{ engineVersion: "0.12.0", controlApiVersion: "1", workflowSchemaVersions: ["1"], features: [] }}
        workerCount={2}
        editLabel="LOCAL MODIFIED"
        onEndpoint={() => undefined}
        onToken={() => undefined}
        onConnect={onConnect}
      />,
    );
    expect(screen.getByText(/CONNECTED/)).toBeTruthy();
    expect(screen.getByText(/0\.12\.0/)).toBeTruthy();
    expect(screen.getByText(/2 workers/)).toBeTruthy();
    expect(screen.getByText(/LOCAL MODIFIED/)).toBeTruthy();
    expect(screen.getByLabelText("Engine endpoint").getAttribute("value")).toBe("http://127.0.0.1:3100");
    screen.getByRole("button", { name: "Reconnect" }).click();
    expect(onConnect).toHaveBeenCalledOnce();
  });
});
