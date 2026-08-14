import assert from "node:assert/strict";
import { test } from "node:test";

import { parseDocFrontmatter } from "../src/docs/frontmatter-parser.ts";
import { verifyEvidenceCommand, type CommandExecutor } from "../src/gates/evidence-runner.ts";
import {
  evaluateGraphState,
  getNextActionableNode,
  type WorkGraphState
} from "../src/state/work-graph-engine.ts";
import { validateToolInvocation } from "../src/tools/harness-tools.ts";

test("E2E Multi-Model Agent Lifecycle Simulation: Work Graph -> Evidence -> State Transition", async () => {
  // 1. Initial Work Graph Setup
  const graphState: WorkGraphState = {
    graphId: "WG-CORE-LIFECYCLE-SIM",
    nodes: {
      "WG-01": {
        id: "WG-01",
        title: "Frontmatter Parser Specification",
        status: "READY",
        dependsOn: [],
        priority: "P1",
        evidenceRequired: ["npm test -- packages/harness-cli/test/frontmatter-parser.test.ts"]
      },
      "WG-02": {
        id: "WG-02",
        title: "Evidence Runner Sandbox",
        status: "BLOCKED",
        dependsOn: ["WG-01"],
        priority: "P1",
        evidenceRequired: ["npm test -- packages/harness-cli/test/evidence-runner.test.ts"]
      },
      "WG-03": {
        id: "WG-03",
        title: "Tool Schema Interface",
        status: "BLOCKED",
        dependsOn: ["WG-02"],
        priority: "P2",
        evidenceRequired: ["npm test -- packages/harness-cli/test/harness-tools.test.ts"]
      }
    }
  };

  // 2. Step 1: Agent queries next actionable node
  const nextNode1 = getNextActionableNode(graphState);
  assert.ok(nextNode1);
  assert.equal(nextNode1.id, "WG-01");

  // 3. Step 2: Agent issues harness_task_start tool call
  const taskStartCall = validateToolInvocation("harness_task_start", {
    nodeId: nextNode1.id,
    title: nextNode1.title,
    allocatedBranch: "feature/WG-01"
  });
  assert.equal(taskStartCall.valid, true);

  // Transition node status to IN_PROGRESS
  graphState.nodes["WG-01"].status = "IN_PROGRESS";

  // 4. Step 3: Agent modifies documents with Frontmatter & verifies parsing
  const sampleDoc = `---
id: POL-006
title: Evidence Standard
category: policy
---
# Document content
`;
  const parsedDoc = parseDocFrontmatter(sampleDoc);
  assert.equal(parsedDoc.hasFrontmatter, true);
  assert.equal(parsedDoc.meta?.id, "POL-006");

  // 5. Step 4: Agent attempts task close with evidence execution
  const mockExecutor: CommandExecutor = async (cmd) => {
    return { exitCode: 0, stdout: "PASS: 10 tests passed", stderr: "" };
  };

  const evidenceResult = await verifyEvidenceCommand(
    "npm test -- packages/harness-cli/test/frontmatter-parser.test.ts",
    { executor: mockExecutor }
  );
  assert.equal(evidenceResult.verdict, "PASS");

  // 6. Step 5: Validate task_close tool call and mark WG-01 COMPLETED
  const taskCloseCall = validateToolInvocation("harness_task_close", {
    nodeId: "WG-01",
    evidenceCommands: ["npm test -- packages/harness-cli/test/frontmatter-parser.test.ts"],
    summary: "Implemented YAML Frontmatter parser and added test coverage"
  });
  assert.equal(taskCloseCall.valid, true);

  graphState.nodes["WG-01"].status = "COMPLETED";

  // 7. Step 6: Work Graph state evaluation automatically unlocks WG-02 to READY
  const evalAfterStep1 = evaluateGraphState(graphState);
  assert.equal(evalAfterStep1.completedNodes.length, 1);
  assert.equal(evalAfterStep1.readyNodes.length, 1);
  assert.equal(evalAfterStep1.readyNodes[0].id, "WG-02");
  assert.equal(evalAfterStep1.blockedNodes.length, 1); // WG-03 is still blocked

  // Next actionable node is now WG-02
  const nextNode2 = getNextActionableNode(graphState);
  assert.ok(nextNode2);
  assert.equal(nextNode2.id, "WG-02");
});
