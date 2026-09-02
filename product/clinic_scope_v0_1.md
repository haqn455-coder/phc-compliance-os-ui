# PHC Compliance OS — Clinic Scope Contract v0.1

Effective: 2026-09-02
Status: FROZEN CURRENT PRODUCT SCOPE

## V1 market scope
The first sellable clinic product covers Punjab Healthcare Commission Category III:
- General Practitioner clinics
- Family Physician clinics
- Specialist / single-specialty clinics

These clinic types share the PHC clinic MSDS framework of 18 standards / 47 indicators used by this product.

## Architecture rule
Use ONE shared requirement pack and ONE backend. Do not create separate GP and specialist compliance backends.

Facility onboarding captures clinic type, services actually offered, clinician/staff credentials, equipment/scope facts and other applicability facts. Conditional requirements are then evaluated from those explicit facts with human review where regulatory/professional/clinical adequacy is involved.

## Compatibility rule for existing `gp_*` identifiers
Existing `gp_*` files, config keys, workflow names, database labels and test names are legacy/internal compatibility identifiers. They do not mean the product is GP-only.

Do not rename verified internal identifiers merely for cosmetic consistency when renaming could break tests, source provenance, release history or auditability. Customer-facing labels should progressively use `GP / Family Physician / Specialist Clinics`.

## Specialist safety boundary
The software must not infer that a clinician is a specialist, that a specialty service is authorized, or that specialist equipment/service conformity is adequate. Those remain evidence-backed human review facts.

Where a requirement depends on specialist service scope, use explicit YES / NO / UNKNOWN applicability facts. Do not use blanket N/A merely because the facility is or is not a specialist clinic.

## Founder pilot boundary
P01 validates the shared engine in the founder clinic. It does not by itself validate every specialty workflow. Before broad specialist marketing, run at least one real specialist-clinic validation profile/pilot using the same 47-indicator engine. Do not rebuild the core.

## Positioning
Use: `PHC/MSDS implementation and inspection-readiness workspace for GP / Family Physician / Specialist Clinics.`

Do not claim:
- PHC approval/certification of the software;
- automatic clinic compliance;
- guaranteed licensing or inspection outcome;
- autonomous legal, professional-scope or clinical adequacy decisions.
