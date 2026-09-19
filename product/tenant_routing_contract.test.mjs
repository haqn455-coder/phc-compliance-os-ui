import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const login=read('../p01-login.html'),clinic=read('../clinic.html'),cockpit=read('../src/components/PHCCockpitApp.tsx'),onboarding=read('../supabase/functions/pilot-onboarding/index.ts');

assert.match(login,/targetTenant=params\.get\('tenant'\)/);
assert.match(login,/emailRedirectTo:targetTenant\?clinicUrl\.toString\(\)/);
assert.match(login,/This link belongs to another clinic/);
assert.match(clinic,/authLinkError=/);
assert.ok(clinic.indexOf('if(authLinkError)')<clinic.lastIndexOf("s.auth.getSession()"));
assert.match(clinic,/void loadSecure\(\)/);
assert.match(clinic,/admin\/tenant-preview\?tenant_id=/);
assert.doesNotMatch(clinic,/memberships.*order\('created_at'.*limit\(1\)/s);
assert.match(clinic,/type="file" accept="image\/\*,application\/pdf" capture="environment"/);
assert.match(clinic,/Evidence storage',2500/);
assert.match(clinic,/try\{await refreshFiles\(\)\}catch/);
const clinicRegisters=clinic.match(/const REG=\[(.*?)\];/s)?.[1].match(/\['[A-Za-z_]+','/g)||[];
assert.equal(clinicRegisters.length,19,'clinic workspace must expose exactly 19 registers');
assert.match(clinic,/Patient Registration & Service Pathway Register/);
assert.match(clinic,/clinicAICaseRegistry/);
assert.match(onboarding,/multiple clinic assignments found/);
assert.match(onboarding,/eq\('tenant_id',requested\)/);
assert.match(onboarding,/admin\/tenant-preview/);
assert.match(onboarding,/redirectTo:tenantRedirect\(tenantId,pilotCode\)/);
assert.match(cockpit,/event==='INITIAL_SESSION'/);
assert.match(cockpit,/event==='TOKEN_REFRESHED'/);

console.log('Tenant routing/auth stability contract tests PASS');
