export interface DocRequiredEvidence {
  type: "unit_test" | "lint" | "git_diff" | "command" | "document_review";
  command?: string;
  description?: string;
}

export interface DocFrontmatter {
  id: string;
  title: string;
  category: "policy" | "design" | "roadmap" | "retrospective" | "backlog" | "general";
  enforced_by?: string;
  required_evidence?: DocRequiredEvidence[];
  risk_level?: "LOW" | "MEDIUM" | "HIGH";
  depends_on?: string[];
  version?: string;
  status?: string;
  [key: string]: unknown;
}

export interface ParsedDocResult {
  meta: DocFrontmatter | null;
  body: string;
  hasFrontmatter: boolean;
  rawFrontmatter?: string;
}

/**
 * Lightweight, zero-dependency YAML Frontmatter parser.
 * Extracts YAML blocks demarcated by leading `---` lines.
 */
export function parseDocFrontmatter(markdownContent: string): ParsedDocResult {
  if (!markdownContent || typeof markdownContent !== "string") {
    return { meta: null, body: "", hasFrontmatter: false };
  }

  const trimmed = markdownContent.trimStart();
  if (!trimmed.startsWith("---")) {
    return { meta: null, body: markdownContent, hasFrontmatter: false };
  }

  // Find the closing --- delimiter
  const lines = trimmed.split(/\r?\n/);
  if (lines[0].trim() !== "---") {
    return { meta: null, body: markdownContent, hasFrontmatter: false };
  }

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    return { meta: null, body: markdownContent, hasFrontmatter: false };
  }

  const yamlLines = lines.slice(1, closingIndex);
  const body = lines.slice(closingIndex + 1).join("\n");
  const rawFrontmatter = yamlLines.join("\n");

  const meta = parseSimpleYaml(yamlLines);

  return {
    meta,
    body,
    hasFrontmatter: true,
    rawFrontmatter
  };
}

/**
 * Simple key-value / nested list YAML parser for frontmatter metadata.
 */
function parseSimpleYaml(lines: string[]): DocFrontmatter {
  const result: Record<string, any> = {};
  let currentKey: string | null = null;
  let currentArray: any[] | null = null;
  let currentObjectInArray: Record<string, any> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) {
      continue;
    }

    const indent = rawLine.search(/\S/);
    const line = rawLine.trim();

    // Top-level key-value or start of array
    if (indent === 0 && line.includes(":")) {
      // Flush previous array object if any
      if (currentKey && currentArray && currentObjectInArray) {
        currentArray.push(currentObjectInArray);
        currentObjectInArray = null;
      }
      if (currentKey && currentArray) {
        result[currentKey] = currentArray;
        currentArray = null;
      }

      const colonIdx = line.indexOf(":");
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();

      if (val === "" || val === "[]") {
        currentKey = key;
        currentArray = val === "[]" ? [] : [];
        result[key] = currentArray;
      } else if (val.startsWith("[") && val.endsWith("]")) {
        // Inline array: [a, b, c]
        const items = val
          .slice(1, -1)
          .split(",")
          .map((s) => cleanScalar(s.trim()))
          .filter((s) => s.length > 0);
        result[key] = items;
        currentKey = null;
      } else {
        result[key] = cleanScalar(val);
        currentKey = null;
      }
    } else if (indent > 0 && currentKey) {
      // Nested list item or object in list
      if (line.startsWith("- ")) {
        if (currentObjectInArray) {
          currentArray?.push(currentObjectInArray);
          currentObjectInArray = null;
        }

        const itemContent = line.slice(2).trim();
        if (itemContent.includes(":")) {
          // Object item in list
          currentObjectInArray = {};
          const cIdx = itemContent.indexOf(":");
          const k = itemContent.slice(0, cIdx).trim();
          const v = cleanScalar(itemContent.slice(cIdx + 1).trim());
          currentObjectInArray[k] = v;
        } else {
          // Primitive item in list
          if (!currentArray) currentArray = [];
          currentArray.push(cleanScalar(itemContent));
        }
      } else if (line.includes(":") && currentObjectInArray) {
        // Property of current object in list
        const cIdx = line.indexOf(":");
        const k = line.slice(0, cIdx).trim();
        const v = cleanScalar(line.slice(cIdx + 1).trim());
        currentObjectInArray[k] = v;
      }
    }
  }

  if (currentKey && currentArray) {
    if (currentObjectInArray) {
      currentArray.push(currentObjectInArray);
    }
    result[currentKey] = currentArray;
  }

  return {
    id: result.id || "",
    title: result.title || "",
    category: result.category || "general",
    enforced_by: result.enforced_by,
    required_evidence: result.required_evidence,
    risk_level: result.risk_level,
    depends_on: result.depends_on,
    version: result.version,
    status: result.status,
    ...result
  };
}

function cleanScalar(str: string): any {
  if (str === "true") return true;
  if (str === "false") return false;
  if (str === "null") return null;
  if (/^-?\d+$/.test(str)) return parseInt(str, 10);
  if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);

  // Strip wrapping quotes
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  return str;
}
