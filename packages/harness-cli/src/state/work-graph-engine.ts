export type WorkNodeStatus =
  | "BLOCKED"
  | "READY"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export interface WorkGraphNode {
  id: string;
  title: string;
  category?: string;
  status: WorkNodeStatus;
  dependsOn: string[];
  priority?: "P1" | "P2" | "P3";
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  humanApprovalRequired?: boolean;
  evidenceRequired?: string[];
  targetFiles?: string[];
  allocatedBranch?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkGraphState {
  graphId: string;
  version?: string;
  nodes: Record<string, WorkGraphNode>;
  updatedAt?: string;
}

export interface GraphEvaluationResult {
  readyNodes: WorkGraphNode[];
  blockedNodes: WorkGraphNode[];
  inProgressNodes: WorkGraphNode[];
  completedNodes: WorkGraphNode[];
  failedNodes: WorkGraphNode[];
  isAllCompleted: boolean;
  hasErrors: boolean;
  errors?: string[];
}

/**
 * Validates that the graph has no circular dependencies using topological sorting (Kahn's algorithm).
 */
export function validateAcyclicGraph(nodes: Record<string, WorkGraphNode>): {
  isAcyclic: boolean;
  cycleNodes?: string[];
  sortedOrder?: string[];
} {
  const inDegree: Record<string, number> = {};
  const adjList: Record<string, string[]> = {};
  const allNodeIds = Object.keys(nodes);

  for (const id of allNodeIds) {
    inDegree[id] = 0;
    adjList[id] = [];
  }

  for (const [id, node] of Object.entries(nodes)) {
    for (const depId of node.dependsOn) {
      if (!nodes[depId]) {
        // Dangling dependency
        continue;
      }
      adjList[depId].push(id);
      inDegree[id] = (inDegree[id] || 0) + 1;
    }
  }

  const queue: string[] = [];
  for (const id of allNodeIds) {
    if (inDegree[id] === 0) {
      queue.push(id);
    }
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    sorted.push(curr);

    for (const neighbor of adjList[curr] || []) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== allNodeIds.length) {
    const cycleNodes = allNodeIds.filter((id) => !sorted.includes(id));
    return {
      isAcyclic: false,
      cycleNodes
    };
  }

  return {
    isAcyclic: true,
    sortedOrder: sorted
  };
}

/**
 * Pure function: Evaluates current node states and updates statuses based on dependency fulfillment.
 */
export function evaluateGraphState(state: WorkGraphState): GraphEvaluationResult {
  const nodes = { ...state.nodes };
  const validation = validateAcyclicGraph(nodes);

  if (!validation.isAcyclic) {
    return {
      readyNodes: [],
      blockedNodes: [],
      inProgressNodes: [],
      completedNodes: [],
      failedNodes: [],
      isAllCompleted: false,
      hasErrors: true,
      errors: [`Circular dependency detected involving nodes: ${validation.cycleNodes?.join(", ")}`]
    };
  }

  const readyNodes: WorkGraphNode[] = [];
  const blockedNodes: WorkGraphNode[] = [];
  const inProgressNodes: WorkGraphNode[] = [];
  const completedNodes: WorkGraphNode[] = [];
  const failedNodes: WorkGraphNode[] = [];

  for (const [id, node] of Object.entries(nodes)) {
    if (node.status === "COMPLETED") {
      completedNodes.push(node);
      continue;
    }
    if (node.status === "FAILED") {
      failedNodes.push(node);
      continue;
    }
    if (node.status === "IN_PROGRESS") {
      inProgressNodes.push(node);
      continue;
    }

    // Check if all prerequisites are COMPLETED
    const arePrereqsSatisfied = node.dependsOn.every((depId) => {
      const depNode = nodes[depId];
      return depNode && depNode.status === "COMPLETED";
    });

    if (arePrereqsSatisfied) {
      const updatedNode = { ...node, status: "READY" as WorkNodeStatus };
      nodes[id] = updatedNode;
      readyNodes.push(updatedNode);
    } else {
      const updatedNode = { ...node, status: "BLOCKED" as WorkNodeStatus };
      nodes[id] = updatedNode;
      blockedNodes.push(updatedNode);
    }
  }

  // Sort readyNodes by priority (P1 > P2 > P3)
  const priorityWeight: Record<string, number> = { P1: 1, P2: 2, P3: 3 };
  readyNodes.sort((a, b) => {
    const wA = priorityWeight[a.priority || "P2"] || 2;
    const wB = priorityWeight[b.priority || "P2"] || 2;
    return wA - wB;
  });

  const totalNodesCount = Object.keys(nodes).length;
  const isAllCompleted = totalNodesCount > 0 && completedNodes.length === totalNodesCount;

  return {
    readyNodes,
    blockedNodes,
    inProgressNodes,
    completedNodes,
    failedNodes,
    isAllCompleted,
    hasErrors: false
  };
}

/**
 * Returns the single top-priority actionable node for the agent to execute next.
 */
export function getNextActionableNode(state: WorkGraphState): WorkGraphNode | null {
  const result = evaluateGraphState(state);
  if (result.inProgressNodes.length > 0) {
    return result.inProgressNodes[0];
  }
  if (result.readyNodes.length > 0) {
    return result.readyNodes[0];
  }
  return null;
}
