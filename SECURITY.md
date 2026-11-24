# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | ✅ Active          |
| < 1.0   | ❌ Not supported   |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue in InboxOS, please report it responsibly.

### How to Report

**Do NOT open a public GitHub issue for security vulnerabilities.**

Please contact the maintainers directly via:
- Email: Use the contact information in the repository profile
- Include a detailed description of the vulnerability
- Provide steps to reproduce if possible
- Do not exploit the vulnerability beyond what is necessary to demonstrate it

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your report within 48 hours
- **Assessment**: Initial assessment within 5 business days
- **Updates**: Regular updates on progress toward resolution
- **Resolution**: Target resolution within 30 days for critical issues
- **Credit**: With your permission, we will credit you in our security advisories

### Safe Harbor

We consider security research conducted in accordance with this policy to be:
- Authorized and lawful
- Helpful to the overall security of the project
- Conducted in good faith

We will not pursue legal action against researchers who follow this policy.

## Security Measures

InboxOS implements multiple layers of security:

### Authentication & Authorization
- HMAC-SHA256 token hashing with purpose separation
- Device verification via OTP challenge for new devices
- Password history enforcement (last 3 passwords blocked)
- Session revocation on password change
- Rate limiting on all auth endpoints via `consume_auth_rate_limit` RPC

### Multi-Tenant Isolation
- Row Level Security (RLS) enabled on all tenant tables
- Workspace-scoped queries enforced at database level
- No cross-tenant data access possible through API or direct queries
- Service role keys restricted to server-side only

### API Security
- Origin validation on all mutation endpoints
- Request signing for internal worker communication
- Timeout and retry limits on external integrations
- Generic error messages on auth endpoints to prevent account enumeration
- Input validation and sanitization on all user inputs

### Build Protections
- Hashed filenames in production builds
- Console/debugger statements removed in production
- Aggressive minification and identifier mangling
- Legal comments stripped from bundles
- Environment variable guards for production deployment

### Data Protection
- Sensitive fields encrypted at rest where applicable
- PII handling compliant with LGPD/GDPR principles
- Audit logging for security-relevant events
- Automatic session expiry and refresh token rotation

## Dependencies

We regularly audit dependencies for known vulnerabilities:
- `npm audit` runs as part of CI/CD
- Critical patches are applied within 7 days
- Major dependency updates are tested thoroughly before merging

## Compliance

This project follows security best practices aligned with:
- OWASP Top 10
- Supabase RLS guidelines
- Vercel security recommendations

---

© 2024–2026 InboxOS. All rights reserved.