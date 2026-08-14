import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HARNESS_AGENT_TOOLS,
  validateToolInvocation
} from "../src/tools/harness-tools.ts";

test("HARNESS_AGENT_TOOLS provides valid JSON Schema definitions for the 4 core actions", () => {
  const toolNames = Object.keys(HARNESS_AGENT_TOOLS);
  assert.deepEqual(toolNames, [
    "harness_session_start",
    "harness_task_start",
    "harness_task_close",
    "harness_session_close"
  ]);

  for (const name of toolNames) {
    const tool = HARNESS_AGENT_TOOLS[name];
    assert.equal(tool.name, name);
    assert.ok(tool.description.length > 10);
    assert.equal(tool.parameters.type, "object");
    assert.ok(Array.isArray(tool.parameters.required));
  }
});

test("validateToolInvocation strictly checks required parameters", () => {
  // Valid task start
  const validTaskStart = validateToolInvocation("harness_task_start", {
    nodeId: "WG-01",
    title: "Frontmatter parser"
  });
  assert.equal(validTaskStart.valid, true);

  // Missing title
  const invalidTaskStart = validateToolInvocation("harness_task_start", {
    nodeId: "WG-01"
  });
  assert.equal(invalidTaskStart.valid, false);
  assert.deepEqual(invalidTaskStart.missingFields, ["title"]);

  // Unknown tool
  const unknownTool = validateToolInvocation("non_existent_tool", {});
  assert.equal(unknownTool.valid, false);
  assert.ok(unknownTool.error?.includes("Unknown harness tool"));
});
