# PHC OS Security Freeze v1

Date: 2026-09-19

## Frozen production baseline
- Firebase Hosting origin: https://phc-compliance-os.web.app
- Supabase project: auzbkudpqdmrgyxtwaiy
- Production source baseline before this hardening branch: 723ded47cfcee8298d61493620d3792fea38f813
- GitHub Pages remains a temporary fallback until Firebase acceptance is complete.
- Repository visibility is unchanged by this freeze.

## Changes in this hardening branch
1. Adds tenant-bound local Backup Data / Restore Backup to clinic.html.
   - Covers indicator notes and review decisions.
   - Covers the 19 device-local registers.
   - Covers IndexedDB evidence files.
   - Restore is blocked when the backup tenant_id differs from the currently opened clinic.
   - Existing register/evidence records are merged by stable record ID.
2. Adds conservative Firebase response headers:
   - Strict-Transport-Security
   - X-Content-Type-Options
   - Referrer-Policy
   - X-Frame-Options: SAMEORIGIN
3. No clinical logic, PHC requirement wording, tenant entitlement rules, payment status, or pilot status is changed.

## Current security findings
- Supabase Security Advisor reports leaked-password protection disabled. This requires an Auth configuration change and is not altered automatically here.
- No service-role or sb_secret key was found by repository code search.
- Existing Edge Function authentication design is unchanged.

## Release discipline
Do not push experimental changes directly to production. Use branch -> build/contract tests -> smoke test -> merge -> Firebase deploy -> smoke test -> freeze.

## Local-data warning
The current clinic workspace intentionally stores evidence/register data in browser-local storage/IndexedDB. A backup file may contain sensitive clinic or patient information. Store backups securely and do not share them in public channels.
