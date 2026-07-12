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
