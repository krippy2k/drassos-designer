import type { ConnectionStatus, EngineInfo } from "@drassos/designer-client";

export function ConnectionBar(props: {
  status: ConnectionStatus;
  endpoint: string;
  info: EngineInfo | null;
  workerCount: number;
  editLabel: string;
  onEndpoint: (endpoint: string) => void;
  onToken: (token: string) => void;
  onConnect: () => void;
}) {
  return (
    <form
      className="connection"
      onSubmit={(event) => {
        event.preventDefault();
        props.onConnect();
      }}
    >
      <label>
        Engine
        <input aria-label="Engine endpoint" value={props.endpoint} onChange={(event) => props.onEndpoint(event.target.value)} />
      </label>
      <label>
        Token
        <input aria-label="Engine token" type="password" onChange={(event) => props.onToken(event.target.value)} />
      </label>
      <button type="submit">{props.status === "CONNECTED" ? "Reconnect" : "Connect"}</button>
      <span>
        {props.status}
        {props.info ? ` · ${props.info.engineVersion}` : ""}
        {props.status === "CONNECTED" ? ` · ${props.workerCount} workers` : ""}
        {` · ${props.editLabel}`}
      </span>
    </form>
  );
}
