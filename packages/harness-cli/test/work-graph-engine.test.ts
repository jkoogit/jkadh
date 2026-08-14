import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateGraphState,
  getNextActionableNode,
  validateAcyclicGraph,
  type WorkGraphState
} from "../src/state/work-graph-engine.ts";

test("validateAcyclicGraph detects valid DAGs and detects cyclic dependencies", () => {
  const validDag = {
    A: { id: "A", title: "Node A", status: "READY" as const, dependsOn: [] },
    B: { id: "B", title: "Node B", status: "BLOCKED" as const, dependsOn: ["A"] },
    C: { id: "C", title: "Node C", status: "BLOCKED" as const, dependsOn: ["A", "B"] }
  };

  const validResult = validateAcyclicGraph(validDag);
  assert.equal(validResult.isAcyclic, true);
  assert.deepEqual(validResult.sortedOrder, ["A", "B", "C"]);

  const cyclicGraph = {
    A: { id: "A", title: "Node A", status: "READY" as const, dependsOn: ["C"] },
    B: { id: "B", title: "Node B", status: "BLOCKED" as const, dependsOn: ["A"] },
    C: { id: "C", title: "Node C", status: "BLOCKED" as const, dependsOn: ["B"] }
  };

  const cyclicResult = validateAcyclicGraph(cyclicGraph);
  assert.equal(cyclicResult.isAcyclic, false);
  assert.ok(cyclicResult.cycleNodes && cyclicResult.cycleNodes.length > 0);
});

test("evaluateGraphState correctly transitions BLOCKED nodes to READY when prerequisites complete", () => {
  const initialState: WorkGraphState = {
    graphId: "WG-TEST",
    nodes: {
      "WG-01": { id: "WG-01", title: "Frontmatter Parser", status: "COMPLETED", dependsOn: [], priority: "P1" },
      "WG-02": { id: "WG-02", title: "Evidence Runner", status: "BLOCKED", dependsOn: ["WG-01"], priority: "P1" },
      "WG-03": { id: "WG-03", title: "Tool Schema", status: "BLOCKED", dependsOn: ["WG-02"], priority: "P2" },
      "WG-04": { id: "WG-04", title: "Work Graph Engine", status: "BLOCKED", dependsOn: ["WG-02"], priority: "P2" },
      "WG-05": { id: "WG-05", title: "E2E Verification", status: "BLOCKED", dependsOn: ["WG-03", "WG-04"], priority: "P1" }
    }
  };

  const evalResult = evaluateGraphState(initialState);
  assert.equal(evalResult.hasErrors, false);
  assert.equal(evalResult.completedNodes.length, 1);
  assert.equal(evalResult.readyNodes.length, 1);
  assert.equal(evalResult.readyNodes[0].id, "WG-02");
  assert.equal(evalResult.blockedNodes.length, 3); // WG-03, WG-04, WG-05

  // Next actionable node must be WG-02
  const nextNode = getNextActionableNode(initialState);
  assert.ok(nextNode);
  assert.equal(nextNode.id, "WG-02");
});

test("getNextActionableNode prefers P1 over P2 when multiple nodes are ready", () => {
  const state: WorkGraphState = {
    graphId: "WG-TEST-PRIORITY",
    nodes: {
      "NODE-P2": { id: "NODE-P2", title: "Doc cleanup", status: "READY", dependsOn: [], priority: "P2" },
      "NODE-P1": { id: "NODE-P1", title: "Critical security fix", status: "READY", dependsOn: [], priority: "P1" }
    }
  };

  const nextNode = getNextActionableNode(state);
  assert.ok(nextNode);
  assert.equal(nextNode.id, "NODE-P1");
});
