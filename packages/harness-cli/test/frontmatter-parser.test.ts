import assert from "node:assert/strict";
import { test } from "node:test";

import { parseDocFrontmatter } from "../src/docs/frontmatter-parser.ts";

test("parseDocFrontmatter parses YAML frontmatter with scalars, arrays, and nested objects", () => {
  const doc = `---
id: POL-006
title: 근거 기반 결과 수용 기준
category: policy
enforced_by: packages/harness-cli/src/gates/check-gate.ts
risk_level: LOW
depends_on:
  - POL-002
  - POL-005
required_evidence:
  - type: unit_test
    command: npm test
  - type: lint
    command: npm run lint
---
# POL-006 근거 기반 결과 수용 기준
본 문서는 근거 기준을 정의한다.
`;

  const parsed = parseDocFrontmatter(doc);

  assert.equal(parsed.hasFrontmatter, true);
  assert.ok(parsed.meta);
  assert.equal(parsed.meta.id, "POL-006");
  assert.equal(parsed.meta.title, "근거 기반 결과 수용 기준");
  assert.equal(parsed.meta.category, "policy");
  assert.equal(parsed.meta.enforced_by, "packages/harness-cli/src/gates/check-gate.ts");
  assert.equal(parsed.meta.risk_level, "LOW");
  assert.deepEqual(parsed.meta.depends_on, ["POL-002", "POL-005"]);
  assert.deepEqual(parsed.meta.required_evidence, [
    { type: "unit_test", command: "npm test" },
    { type: "lint", command: "npm run lint" }
  ]);
  assert.ok(parsed.body.includes("# POL-006 근거 기반 결과 수용 기준"));
});

test("parseDocFrontmatter gracefully handles documents without frontmatter", () => {
  const plainDoc = `# Standard Markdown Document
- No frontmatter here
`;

  const parsed = parseDocFrontmatter(plainDoc);
  assert.equal(parsed.hasFrontmatter, false);
  assert.equal(parsed.meta, null);
  assert.equal(parsed.body, plainDoc);
});

test("parseDocFrontmatter handles inline arrays and booleans", () => {
  const doc = `---
id: DSN-008
title: Work Graph Engine
category: design
active: true
priority: 1
tags: [graph, engine, dag]
---
# Content Body
`;

  const parsed = parseDocFrontmatter(doc);
  assert.equal(parsed.hasFrontmatter, true);
  assert.ok(parsed.meta);
  assert.equal(parsed.meta.id, "DSN-008");
  assert.equal(parsed.meta.active, true);
  assert.equal(parsed.meta.priority, 1);
  assert.deepEqual(parsed.meta.tags, ["graph", "engine", "dag"]);
});
