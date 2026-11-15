/** Writes docs/permission-matrix.md from the matrix definition, for human review. */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE0_MATRIX, SUBJECTS, SUBJECT_LABELS } from "../src/matrix";
import { CASE_SUBJECTS, CASE_SUBJECT_LABELS, PHASE1_MATRIX } from "../src/case-matrix";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/permission-matrix.md");
const header = `| Action | ${SUBJECTS.map((s) => SUBJECT_LABELS[s]).join(" | ")} |`;
const sep = `| --- | ${SUBJECTS.map(() => ":---:").join(" | ")} |`;
const rows = PHASE0_MATRIX.map((r) => `| ${r.label} | ${SUBJECTS.map((s) => (r.allowed.includes(s) ? "✅" : "—")).join(" | ")} |`);
const caseHeader = `| Action | ${CASE_SUBJECTS.map((s) => CASE_SUBJECT_LABELS[s]).join(" | ")} |`;
const caseSep = `| --- | ${CASE_SUBJECTS.map(() => ":---:").join(" | ")} |`;
const caseRows = PHASE1_MATRIX.map((r) => `| ${r.label} | ${CASE_SUBJECTS.map((s) => (r.allowed.includes(s) ? "✅" : "—")).join(" | ")} |`);
const md = `# Permission matrix

Generated from \`packages/policy/src/matrix.ts\` by \`pnpm matrix:report\`. Do not edit by hand.

Every cell is tested three ways: against the policy module, against the API over HTTP,
and (for data access) directly against PostgreSQL row-level security as the application role.

## Platform (Phase 0)

${header}
${sep}
${rows.join("\n")}

## Inside a case (Phase 1)

One fictional case: Acme Widgets Ltd v Bloggs Builders Ltd. The claimant's solicitor opened it,
instructed counsel and an expert, added the client and invited the defendant's solicitor; the case is
linked to a court whose registry assigned a judge.

${caseHeader}
${caseSep}
${caseRows.join("\n")}
`;
await writeFile(out, md);
console.log(`Wrote ${path.relative(process.cwd(), out)}`);
