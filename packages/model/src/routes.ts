export type DesignerRoute =
  | { name: "login" }
  | { name: "register" }
  | { name: "projects" }
  | { name: "project"; projectId: string; section: "overview" | "workflows" | "runs" | "usage" | "resources" | "deployments" | "settings" }
  | { name: "workflow"; projectId: string; workflowId: string; section: "design" | "runs" }
  | { name: "run"; projectId: string; workflowId: string; runId: string };

const PROJECT_SECTIONS = new Set(["overview", "workflows", "runs", "usage", "resources", "deployments", "settings"]);

export function parseDesignerRoute(hash: string): DesignerRoute {
  const path = hash.replace(/^#/, "").split("?")[0]?.replace(/\/$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "register") {
    return { name: "register" };
  }
  if (parts[0] === "login" || parts.length === 0) {
    return { name: "login" };
  }
  if (parts[0] !== "projects") {
    return { name: "login" };
  }
  if (!parts[1]) {
    return { name: "projects" };
  }
  const projectId = decodeURIComponent(parts[1]);
  if (!parts[2]) {
    return { name: "project", projectId, section: "overview" };
  }
  if (parts[2] !== "workflows") {
    const section = PROJECT_SECTIONS.has(parts[2] ?? "") ? (parts[2] as "runs" | "usage" | "resources" | "deployments" | "settings") : "overview";
    return { name: "project", projectId, section };
  }
  if (!parts[3]) {
    return { name: "project", projectId, section: "workflows" };
  }
  const workflowId = decodeURIComponent(parts[3]);
  if (parts[4] === "runs" && parts[5]) {
    return { name: "run", projectId, workflowId, runId: decodeURIComponent(parts[5]) };
  }
  if (parts[4] === "runs") {
    return { name: "workflow", projectId, workflowId, section: "runs" };
  }
  return { name: "workflow", projectId, workflowId, section: "design" };
}

export function designerHref(route: DesignerRoute): string {
  switch (route.name) {
    case "login":
      return "#/login";
    case "register":
      return "#/register";
    case "projects":
      return "#/projects";
    case "project":
      return route.section === "overview" ? `#/projects/${route.projectId}` : `#/projects/${route.projectId}/${route.section}`;
    case "workflow":
      return route.section === "runs"
        ? `#/projects/${route.projectId}/workflows/${route.workflowId}/runs`
        : `#/projects/${route.projectId}/workflows/${route.workflowId}`;
    case "run":
      return `#/projects/${route.projectId}/workflows/${route.workflowId}/runs/${route.runId}`;
  }
}
