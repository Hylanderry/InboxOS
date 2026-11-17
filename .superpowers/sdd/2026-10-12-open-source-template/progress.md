# SDD ledger - plan: docs/superpowers/plans/2026-10-12-open-source-template.md

Pre-flight: shared interfaces are limited to the copy allowlist feeding the public metadata/documentation; validation runs against the independent output folder.

Task 1: complete - public copy created at Desktop/INBOX OS - OPEN SOURCE; runtime source, migrations, tests, required Netlify functions and gates preserved; local artifacts excluded.
Task 2: complete - MIT, .env.example, README, CONTRIBUTING, SECURITY and public .gitignore created; package made public as inboxos-open-source.
Task 3: complete - private project refs, aliases, CNPJ, instance names and staging-only migration removed or generalized; no private-reference scan hits remain.
Task 4: complete - npm ci, npm test 291/291, audit:release PASS, lint 0 errors/6 existing warnings, tsc PASS and build PASS; node_modules/dist removed after validation.
Final review: self-review (no subagent tool) - output tree, private-reference scan, package metadata, env example, license, README and artifact exclusion reviewed.
Final: Ruling: generated dependency/build folders are validated and removed from the public folder; they remain reproducible via npm ci and npm run build. Cost if wrong: users must reinstall locally, which is documented.
Final verification: temporary `npm ci` and `npm test` rerun after formatting/sanitization; 291/291 PASS. `node_modules` removed again from delivery.
