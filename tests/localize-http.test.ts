import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../apps/api/src/app.ts";
import { closeDb } from "@aihot/backend/db";
import { MCP_TOOL_NAMES } from "@aihot/contracts/mcp";

const app = await buildApp();
after(async () => { await app.close(); await closeDb(); });

test("OpenAPI declares the article language parameter", async () => {
  const response = await app.inject({ method: "GET", url: "/openapi-v1.json" });
  assert.equal(response.statusCode, 200);
  const doc = response.json();
  for (const path of ["/api/v1/items", "/api/v1/selected/snapshot", "/api/v1/selected/changes", "/api/v1/stories/{publicId}", "/api/v1/hot-topics", "/api/v1/dailies", "/api/v1/dailies/latest", "/api/v1/dailies/{date}"]) {
    const parameters = doc.paths[path].get.parameters.map((p: any) => p.$ref ? doc.components.parameters[p.$ref.split("/").pop()] : p);
    const lang = parameters.find((p: any) => p.name === "lang");
    assert.ok(lang, path);
    assert.deepEqual(lang.schema.enum, ["zh", "ru", "en"]);
    assert.equal(lang.schema.default, "zh");
  }
});

test("invalid languages are rejected before any database read", async () => {
  for (const url of ["/api/v1/items?lang=de", "/api/v1/selected/snapshot?lang=de", "/api/v1/selected/changes?lang=de", "/api/site/items/missing?lang=de", "/api/site/timeline?lang=de", "/feed.xml?lang=de"]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 400, url);
    assert.equal(response.json().code, "invalid_request", url);
  }
});

async function rpc(method: string, params: Record<string, unknown>) {
  const response = await app.inject({ method: "POST", url: "/api/mcp",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    payload: { jsonrpc: "2.0", id: 1, method, params },
  });
  const data = response.body.split("\n").find((line) => line.startsWith("data: "));
  return data ? JSON.parse(data.slice(6)) : response.json();
}

test("every MCP tool declares an optional language and rejects an invalid language", async () => {
  const listed = await rpc("tools/list", {});
  assert.equal(listed.result.tools.length, Object.keys(MCP_TOOL_NAMES).length);
  for (const tool of listed.result.tools) {
    assert.deepEqual(tool.inputSchema.properties.lang.enum, ["zh", "ru", "en"]);
    assert.equal(tool.inputSchema.properties.lang.default, "zh");
    assert.ok(!tool.inputSchema.required?.includes("lang"));
    const response = await rpc("tools/call", { name: tool.name, arguments: { lang: "de", ...(tool.name === MCP_TOOL_NAMES.search ? { q: "test" } : {}), ...(tool.name === MCP_TOOL_NAMES.story ? { public_id: "missing" } : {}) } });
    assert.ok(response.error || response.result?.isError, tool.name);
  }
});
