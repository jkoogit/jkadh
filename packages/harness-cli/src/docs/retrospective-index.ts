import { parseMarkdownLink, parseMarkdownTableRows } from "./markdown-table.ts";

export interface RetrospectiveEntry {
  id: string;
  title: string;
  status: string;
  path: string;
}

export function parseLatestRetrospective(markdown: string): RetrospectiveEntry | undefined {
  return parseMarkdownTableRows(markdown)
    .filter((cells) => cells.length >= 3 && /^RET-\d+/.test(cells[0]))
    .map((cells) => {
      const link = parseMarkdownLink(cells[1]);
      return {
        id: cells[0],
        title: link?.text ?? cells[1],
        status: cells[2],
        path: link?.path ?? ""
      };
    })
    .sort((left, right) => retrospectiveNumber(right.id) - retrospectiveNumber(left.id))[0];
}

function retrospectiveNumber(id: string): number {
  return Number(id.replace("RET-", ""));
}
