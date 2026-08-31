import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildStatusPatch,assertReopenMatch} from './gp_snapshot_ops_logic.mjs';

assert.deepEqual(buildStatusPatch('QUALIFIED','WAITLIST_UNTIL_PRODUCTION_PACK'),{lead_status:'QUALIFIED',pilot_status:'WAITLIST_UNTIL_PRODUCTION_PACK'});
assert.deepEqual(buildStatusPatch('PILOT_WAITLIST','NOT_OFFERED'),{lead_status:'PILOT_WAITLIST',pilot_status:'NOT_OFFERED'});
assert.throws(()=>buildStatusPatch('PILOT_OFFERED','WAITLIST_UNTIL_PRODUCTION_PACK'),/blocked until production pack release/);
assert.throws(()=>buildStatusPatch('QUALIFIED','OFFERED'),/blocked until production pack release/);
assert.throws(()=>buildStatusPatch('QUALIFIED','ACCEPTED'),/blocked until production pack release/);
assert.throws(()=>buildStatusPatch('QUALIFIED','COMPLETED'),/blocked until production pack release/);
assertReopenMatch(['R01','R03'],[{rule_id:'R01'},{rule_id:'R03'}]);
assert.throws(()=>assertReopenMatch(['R01'],[{rule_id:'R02'}]),/no longer matches/);

const ui=fs.readFileSync(new URL('./gp_snapshot_ops_ui.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(ui,/Snapshot Operations/);
assert.match(ui,/Reopen \/ Reprint/);
const patchSource=ui.match(/const patch=\{[^}]+\}/s)?.[0]||'';
assert.match(patchSource,/lead_status:/);
assert.match(patchSource,/pilot_status:/);
assert.doesNotMatch(patchSource,/answers|triggered_rule_ids|clinic_name|contact|tenant_id/);
assert.match(ui,/Snapshot answers, preview rules, creator and clinic identity are immutable/);
assert.doesNotMatch(ui,/PILOT_OFFERED','PILOT_ACCEPTED/);
assert.match(html,/gp_snapshot_ops_ui\.js/);
assert.match(html,/id=snapops/);
assert.match(html,/&quot;/);
console.log('GP snapshot operations logic/source tests PASS');
