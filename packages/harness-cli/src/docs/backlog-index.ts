import { parseMarkdownLink, parseMarkdownTableRows } from "./markdown-table.ts";

export interface BacklogIndexEntry {
  id: string;
  title: string;
  status: string;
  timing: string;
  priority: string;
  path: string;
}

export function parseBacklogIndex(markdown: string): BacklogIndexEntry[] {
  return parseMarkdownTableRows(markdown)
    .filter((cells) => cells.length >= 8 && /^BLG-\d+/.test(cells[0]))
    .map((cells) => {
      const link = parseMarkdownLink(cells[7]);
      return {
        id: cells[0],
        title: cells[1],
        status: cells[2],
        timing: cells[3],
        priority: cells[4],
        path: link?.path ?? cells[7]
      };
    });
}

export function countUnresolvedBacklogEntries(markdown: string): number {
  return parseBacklogIndex(markdown)
    .filter((entry) => !/^(Done|Closed|Resolved|Rejected)$/i.test(entry.status))
    .length;
}

export function hasBacklogIndexEntry(markdown: string, input: { backlogId?: string; path?: string }): boolean {
  const entries = parseBacklogIndex(markdown);
  return entries.some((entry) =>
    Boolean(input.backlogId && entry.id === input.backlogId)
    || Boolean(input.path && normalizePath(entry.path) === normalizePath(input.path))
  );
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^docs\/15\.로그\/backlog\//, "")
    .replace(/^\.\//, "");
}
