import { useState } from "react";
import type { WorkflowDefinition } from "@drassos/designer-model";

export function WorkflowPackageActions(props: {
  definition: WorkflowDefinition | null;
  token: string;
  projectId: string;
  published?: { version: string; packageDigest: string } | null;
  onImported: (definition: WorkflowDefinition) => void;
  onOpened?: (opened: { definition: WorkflowDefinition; version: string; packageDigest: string }) => void;
  onPublished: (published: { version: string; packageDigest: string }) => void;
  onError: (message: string) => void;
  download?: (filename: string, files: Record<string, string>) => void;
}) {
  const [published, setPublished] = useState(props.published ?? null);
  const disabled = !props.definition || props.definition.metadata?.source === "code";
  async function publish() {
    if (!props.definition) {
      return;
    }
    try {
      const published = await request<Published>(props.token, "POST", endpoint(props, "publish"), { definition: props.definition });
      const next = { version: published.version, packageDigest: published.packageDigest };
      setPublished(next);
      props.onPublished(next);
    } catch (error) {
      props.onError(error instanceof Error ? error.message : "Publish failed");
    }
  }
  async function exportSource() {
    if (!props.definition) {
      return;
    }
    try {
      const exported = await request<{ files: Record<string, string> }>(props.token, "POST", endpoint(props, "export"), { definition: props.definition });
      (props.download ?? downloadZip)(`${props.definition.id}-source.zip`, exported.files);
    } catch (error) {
      props.onError(error instanceof Error ? error.message : "Export failed");
    }
  }
  async function openPublished() {
    if (!props.definition) {
      return;
    }
    try {
      const opened = await request<{ definition: WorkflowDefinition; version: string; packageDigest: string }>(
        props.token,
        "GET",
        `${endpoint(props, "published")}?version=${encodeURIComponent(props.definition.version)}`,
      );
      if (props.onOpened) {
        props.onOpened(opened);
      } else {
        props.onImported(opened.definition);
      }
    } catch (error) {
      props.onError(error instanceof Error ? error.message : "Open published failed");
    }
  }
  async function importSource(list: FileList | null) {
    if (!list || list.length === 0) {
      return;
    }
    const files = await readSourceFiles(list);
    try {
      const imported = await request<{ definition: WorkflowDefinition }>(props.token, "POST", endpoint(props, "import"), { files });
      props.onImported(imported.definition);
    } catch (error) {
      props.onError(error instanceof Error ? error.message : "Import failed");
    }
  }
  return (
    <span className="package-actions">
      <button type="button" disabled={disabled} onClick={() => void publish()}>Publish</button>
      <button type="button" disabled={disabled} onClick={() => void exportSource()}>Export source</button>
      <button type="button" disabled={disabled} onClick={() => void openPublished()}>Open published</button>
      <label className="btn btn-ghost">
        Import source
        <input aria-label="Import workflow source" type="file" multiple disabled={disabled} onChange={(event) => void importSource(event.target.files)} />
      </label>
      {published ? <span>Published {published.version} {published.packageDigest.slice(0, 12)}</span> : null}
    </span>
  );
}

interface Published {
  version: string;
  packageDigest: string;
}

function endpoint(props: { projectId: string; definition: WorkflowDefinition | null }, action: string): string {
  return `/api/projects/${props.projectId}/workflows/${props.definition?.id ?? ""}/${action}`;
}

async function request<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json() as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Workflow package request failed");
  }
  return payload as T;
}

async function readSourceFiles(list: FileList): Promise<Record<string, string>> {
  const entries = await Promise.all([...list].map(async (file) => {
    const relative = file.webkitRelativePath || file.name;
    return [relative, await file.text()] as const;
  }));
  const folder = entries.every(([path]) => path.includes("/")) ? entries[0]?.[0]?.split("/")[0] : undefined;
  const files: Record<string, string> = {};
  for (const [path, content] of entries) {
    const key = folder && path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : path;
    files[key] = content;
  }
  return files;
}

function downloadZip(filename: string, files: Record<string, string>): void {
  const blob = new Blob([zipTextFiles(files)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function zipTextFiles(files: Record<string, string>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [path, content] of Object.entries(files)) {
    const name = new TextEncoder().encode(path);
    const data = new TextEncoder().encode(content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    write(local, 0, 0x04034b50);
    local[8] = 0;
    write(local, 14, crc);
    write(local, 18, data.length);
    write(local, 22, data.length);
    local[26] = name.length & 0xff;
    local[27] = (name.length >> 8) & 0xff;
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);
    const central = new Uint8Array(46 + name.length);
    write(central, 0, 0x02014b50);
    write(central, 16, crc);
    write(central, 20, data.length);
    write(central, 24, data.length);
    central[28] = name.length & 0xff;
    central[29] = (name.length >> 8) & 0xff;
    write(central, 42, offset);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  write(end, 0, 0x06054b50);
  end[8] = centrals.length & 0xff;
  end[10] = centrals.length & 0xff;
  write(end, 12, centralSize);
  write(end, 16, offset);
  const output = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...locals, ...centrals, end]) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

function write(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
