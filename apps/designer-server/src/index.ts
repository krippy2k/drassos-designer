const engineUrl = process.env.DRASSOS_ENGINE_URL ?? "http://127.0.0.1:3100";

if (process.env.DESIGNER_EMBEDDED === "1") {
  const { createDesignerHost } = await import("./host.ts");
  const port = Number(process.env.DESIGNER_PORT ?? 3300);
  const host = await createDesignerHost({ port });
  console.log(`Drassos Designer embedded server ${host.url}`);
} else {
  const { startSaasServer } = await import("../../../packages/saas/src/index.ts");
  const port = Number(process.env.DESIGNER_PORT ?? 3300);
  const server = await startSaasServer({
    port,
    engineUrl,
    store: new (await import("../../../packages/saas/src/store.ts")).SaasStore(process.env.DESIGNER_DATA ?? ".designer/saas.json"),
  });
  console.log(`Drassos Designer SaaS ${server.url}`);
  console.log(`Engine ${engineUrl}`);
}

export {};
