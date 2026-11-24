# Contributing to InboxOS

Thank you for your interest in InboxOS. This document outlines the guidelines for contributing to this project.

## ⚠️ Important Notice

InboxOS is a **proprietary, closed-source** project. All rights are reserved by the copyright holder. Please read the [LICENSE](./LICENSE) file before contributing or using any part of this codebase.

## How to Contribute

### Reporting Issues

If you find a bug or have a feature request:

1. Check existing issues first to avoid duplicates
2. Use the issue templates when available
3. Provide clear reproduction steps for bugs
4. Include environment details (Node version, OS, browser)

### Code Contributions

All code contributions require prior written authorization from the project maintainers. Unauthorized pull requests will be closed.

If you have been authorized to contribute:

1. Fork the repository (if applicable)
2. Create a feature branch from `main`
3. Follow the coding standards below
4. Ensure all tests pass (`npm test`)
5. Run lint checks (`npm run lint`)
6. Verify TypeScript compilation (`npx tsc --noEmit`)
7. Submit a pull request with a clear description

## Coding Standards

### Frontend

- **React**: Functional components with hooks only
- **Styling**: Tailwind CSS utility classes; custom design tokens via `ux-*` classes
- **Icons**: Phosphor Icons exclusively (no Lucide or other icon libraries)
- **Typography**: Inter + Plus Jakarta Sans via Google Fonts
- **Animations**: Use CSS variables (`--motion-fast`, `--motion-ease`) and GPU-accelerated properties (`transform`, `opacity`)
- **Accessibility**: WCAG 2.1 AA minimum; all interactive elements must have proper ARIA attributes

### Backend

- **Server Functions**: TanStack Start server functions for API endpoints
- **Database**: Supabase PostgreSQL with RLS enabled for all tenant tables
- **Auth**: HMAC-SHA256 for token hashing; never store plaintext secrets
- **Rate Limiting**: All mutation endpoints must implement rate limiting via `consume_auth_rate_limit` RPC
- **Error Handling**: Generic error messages for auth endpoints to prevent account enumeration

### General

- **Language**: Portuguese (BR) for user-facing strings; English for code comments and technical documentation
- **Commits**: Conventional Commits format (`feat:`, `fix:`, `refactor:`, etc.)
- **Branch Naming**: `feat/`, `fix/`, `refactor/`, `chore/` prefixes
- **No Secrets**: Never commit `.env` files, API keys, or credentials

## Architecture Overview

```
src/
├── components/ui/       # Reusable UI primitives (shadcn-based)
├── features/
│   ├── auth/            # Authentication flows & validation
│   ├── inbox/           # Chat, CRM, Dashboard, Agents, Calendar
│   └── legal/           # Terms, Privacy, Consent management
├── integrations/        # Supabase, Evolution API clients
├── routes/              # TanStack Router file-based routes
├── server/              # Server functions & middleware
└── styles.css           # Global design system & animations
```

## Development Setup

See [README.md](./README.md#instalação-local) for full setup instructions.

## Support

For questions or support requests, please open an issue or contact the maintainers directly.

---

© 2024–2026 InboxOS. All rights reserved.