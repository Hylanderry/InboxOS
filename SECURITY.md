# Security

Never publish credentials, tokens, private keys or real `.env` files in issues,
pull requests or the repository. Use `.env.example` as the only template.

Before a public installation, apply the migrations in an isolated Supabase
staging project and validate RLS, authentication, Evolution API and storage.
Do not send real WhatsApp messages during automated tests.

If a credential was ever committed, rotate it before publishing a fork. Removing
the file from the current tree does not remove it from Git history.

Report security issues privately to Ackley Studios by Trax Company with a minimal
reproduction, impact and a secure contact channel. Do not disclose exploitable
details in a public issue.

## Dependency audit scope

The release gate audits runtime dependencies with `npm audit --omit=dev --audit-level=high`.
Run the full development-tree audit after dependency updates and review upstream
advisories before enabling a new build adapter. Development-only packages are not
shipped as application runtime dependencies.
