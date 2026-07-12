import { parseMarkdownLink } from "./markdown-table.ts";

export interface ReferenceDoc {
  title: string;
  path: string;
}

export interface RetrospectiveDetail {
  recommendedSessionName?: string;
  recommendedStartPoint?: string;
  remainingBacklog?: string;
  referenceDocs: ReferenceDoc[];
}

export function parseRetrospectiveDetail(markdown: string): RetrospectiveDetail {
  return {
    recommendedSessionName: extractBulletValue(markdown, "다음 세션 추천 세션명"),
    recommendedStartPoint: extractBulletValue(markdown, "다음 세션 권장 시작점"),
    remainingBacklog: extractBulletValue(markdown, "남은 Backlog"),
    referenceDocs: extractReferenceDocs(markdown)
  };
}

function extractBulletValue(markdown: string, label: string): string | undefined {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`- ${escapedLabel}:\\s*(.+)`));
  return match?.[1]?.trim();
}

function extractReferenceDocs(markdown: string): ReferenceDoc[] {
  const relatedDocsSection = markdown.split("## 10. 관련 문서")[1]?.split("\n## ")[0] ?? "";
  return relatedDocsSection
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => parseMarkdownLink(line.slice(2)))
    .filter((link): link is { text: string; path: string } => Boolean(link))
    .map((link) => ({
      title: link.text,
      path: link.path
    }));
}
