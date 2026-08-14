/**
 * AI Agent Tool Definitions conforming to standard JSON Schema specifications
 * for Gemini, OpenAI Function Calling, Anthropic Claude Tool Use, and MCP (Model Context Protocol).
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const HARNESS_AGENT_TOOLS: Record<string, ToolDefinition> = {
  harness_session_start: {
    name: "harness_session_start",
    description: "Initializes a development session, loads the active Work Graph, and validates repository readiness.",
    parameters: {
      type: "object",
      properties: {
        agentRole: {
          type: "string",
          description: "Role of the executing agent (e.g., 'CTO', 'Engineer', 'Architect')",
          default: "Engineer"
        },
        model: {
          type: "string",
          description: "Identifier of the LLM model (e.g., 'gemini-3.7-flash', 'gpt-5', 'claude-3-7-sonnet')"
        },
        issueNumber: {
          type: "integer",
          description: "Optional linked issue number"
        }
      },
      required: []
    }
  },

  harness_task_start: {
    name: "harness_task_start",
    description: "Binds an actionable Work Graph node and creates an isolated task Git branch.",
    parameters: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Work Graph Node ID to start (e.g., 'WG-01', 'WG-02')"
        },
        title: {
          type: "string",
          description: "Brief summary of the task"
        },
        allocatedBranch: {
          type: "string",
          description: "Target branch to check out (e.g., 'feature/WG-01-frontmatter-parser')"
        },
        planSteps: {
          type: "array",
          items: { type: "string" },
          description: "List of planned implementation steps"
        }
      },
      required: ["nodeId", "title"]
    }
  },

  harness_task_close: {
    name: "harness_task_close",
    description: "Executes required evidence commands (POL-006) and requests promotion/merge to the base branch.",
    parameters: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Work Graph Node ID being closed"
        },
        evidenceCommands: {
          type: "array",
          items: { type: "string" },
          description: "Whitelisted commands executed for evidence verification (e.g., ['npm test'])"
        },
        summary: {
          type: "string",
          description: "Summary of changes made"
        },
        docSideEffects: {
          type: "array",
          items: { type: "string" },
          description: "List of documentation files created or updated"
        }
      },
      required: ["nodeId", "evidenceCommands", "summary"]
    }
  },

  harness_session_close: {
    name: "harness_session_close",
    description: "Concludes the current development session, writes retrospective (RET) and outputs the next handoff prompt.",
    parameters: {
      type: "object",
      properties: {
        retrospectiveTitle: {
          type: "string",
          description: "Title for the session retrospective document"
        },
        completedNodes: {
          type: "array",
          items: { type: "string" },
          description: "List of completed Work Graph node IDs"
        },
        backlogItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              priority: { type: "string", enum: ["Low", "Medium", "High"] }
            },
            required: ["title"]
          },
          description: "New backlog issues identified during the session"
        }
      },
      required: ["retrospectiveTitle", "completedNodes"]
    }
  }
};

/**
 * Validates whether tool arguments strictly satisfy the JSON Schema required fields and types.
 */
export function validateToolInvocation(
  toolName: string,
  args: Record<string, any>
): { valid: boolean; missingFields?: string[]; error?: string } {
  const tool = HARNESS_AGENT_TOOLS[toolName];
  if (!tool) {
    return { valid: false, error: `Unknown harness tool: '${toolName}'` };
  }

  const missingFields: string[] = [];
  for (const requiredField of tool.parameters.required) {
    if (args[requiredField] === undefined || args[requiredField] === null || args[requiredField] === "") {
      missingFields.push(requiredField);
    }
  }

  if (missingFields.length > 0) {
    return {
      valid: false,
      missingFields,
      error: `Missing required parameter(s) for ${toolName}: ${missingFields.join(", ")}`
    };
  }

  return { valid: true };
}
