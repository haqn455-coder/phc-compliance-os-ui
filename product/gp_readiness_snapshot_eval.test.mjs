import fs from 'node:fs';
import assert from 'node:assert/strict';
import { evaluateSnapshot } from './gp_readiness_snapshot_eval.mjs';
const config = JSON.parse(fs.readFileSync(new URL('./gp_readiness_snapshot_v0_1.json', import.meta.url), 'utf8'));

const highRisk = {
  Q07:['Consultation','Dispensing medicines'],
  Q08:'Unsure', Q10:'No', Q11:'Scattered / paper folders', Q12:'No', Q13:'Partly', Q14:'No', Q15:'No', Q16:'No defined process', Q17:'No', Q18:'No', Q19:'No'
};
const r1 = evaluateSnapshot(config, highRisk);
assert.equal(r1.flagged_actions.length, 5);
assert.deepEqual(r1.flagged_actions.map(x=>x.rule_id), ['R01','R02','R03','R04','R05']);
assert.equal(r1.flagged_actions[0].verification_required, true);
assert.equal(r1.phc_score, null);
assert.equal(r1.compliance_pass_fail, null);
assert.equal(r1.cta.price_pkr, 20000);

const dispensingOff = {Q07:['Consultation'],Q18:'No'};
const r2 = evaluateSnapshot(config, dispensingOff);
assert.equal(r2.flagged_actions.some(x=>x.rule_id==='R09'), false);

const allGood = {Q08:'Regular licence',Q10:'Yes',Q11:'Organised and easy to retrieve',Q12:'Yes',Q13:'Yes',Q14:'Yes',Q15:'Yes',Q16:'Displayed/documented process',Q17:'Yes',Q19:'Yes'};
const r3 = evaluateSnapshot(config, allGood);
assert.equal(r3.flagged_actions.length, 0);
assert.equal(r3.result_type, 'PRELIMINARY_READINESS_SNAPSHOT');

console.log('GP readiness snapshot evaluator PASS');
