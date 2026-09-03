# PHC Compliance OS — BYO Google Drive Persistence Adapter v0.1

Purpose: zero-cost clinic-specific persistence into the clinic/customer's own Google Sheets + Google Drive.

## Architecture
Authenticated product/backend -> Apps Script web app -> clinic-owned Sheets/Drive.

Do not call this adapter directly from a public GitHub Pages frontend because the API key would be exposed.

## Required Script Properties
- `TENANT_ID`
- `PERSISTENCE_API_KEY`
- `OPD_SHEET_ID`
- `COMPLIANCE_SHEET_ID`
- `CONTROL_SHEET_ID`
- `OPD_ATTACHMENTS_FOLDER_ID`
- `COMPLIANCE_EVIDENCE_FOLDER_ID`
- `EXPORTS_FOLDER_ID`

## Supported actions
- `health`
- `append_opd` — allowed tabs: Case Registry, Doctor Review, Medication Lines
- `append_register` — whitelisted compliance/admin register tabs
- `index_evidence`
- `upload_evidence`

## Controls
- tenant ID match required
- shared secret required
- append-by-existing-header only
- formula-injection protection for text cells
- evidence folder routes whitelisted
- 8 MB evidence upload pilot limit
- unique `request_id` write guard
- no automatic retries; duplicate request is returned as duplicate and must be human-reviewed
- no autonomous diagnosis/prescribing or regulated authorization decisions

## Founder P01 deployment values
Use the current P01 Tenant Persistence Control sheet as source of truth for IDs. Keep the secret only in Apps Script properties and the authenticated backend secret store; never commit it to GitHub or place it in browser JavaScript.

## Product claim boundary
When this adapter is deployed and E2E-verified, customer wording may state that OPD records, digital registers, and evidence are stored in clinic-specific Google Sheets/Drive. Until then use `STRUCTURE_READY_ENDPOINT_NOT_DEPLOYED` for P01.
