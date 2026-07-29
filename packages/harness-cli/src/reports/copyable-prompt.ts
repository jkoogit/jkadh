export function formatCopyablePrompt(prompt: string): string {
  return ["```text", prompt.trim(), "```"].join("\n");
}
