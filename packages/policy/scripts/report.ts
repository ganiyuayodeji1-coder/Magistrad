/** Writes docs/permission-matrix.md from the matrix definition, for human review. */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE0_MATRIX, SUBJECTS, SUBJECT_LABELS } from "../src/matrix";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/permission-matrix.md");
const header = `| Action | ${SUBJECTS.map((s) => SUBJECT_LABELS[s]).join(" | ")} |`;
const sep = `| --- | ${SUBJECTS.map(() => ":---:").join(" | ")} |`;
const rows = PHASE0_MATRIX.map((r) => `| ${r.label} | ${SUBJECTS.map((s) => (r.allowed.includes(s) ? "✅" : "—")).join(" | ")} |`);
const md = `# Permission matrix (Phase 0)

Generated from \`packages/policy/src/matrix.ts\` by \`pnpm matrix:report\`. Do not edit by hand.

Every cell is tested three ways: against the policy module, against the API over HTTP,
and (for data access) directly against PostgreSQL row-level security as the application role.

${header}
${sep}
${rows.join("\n")}
`;
await writeFile(out, md);
console.log(`Wrote ${path.relative(process.cwd(), out)}`);
