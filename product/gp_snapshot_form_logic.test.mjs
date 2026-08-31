import fs from 'node:fs';
import assert from 'node:assert/strict';
import { evaluateSnapshot } from './gp_readiness_snapshot_eval.mjs';
import { visibleQuestions, buildPresalesPayload, snapshotOutputModel } from './gp_snapshot_form_logic.mjs';

const config = JSON.parse(fs.readFileSync(new URL('./gp_readiness_snapshot_v0_1.json', import.meta.url), 'utf8'));

const base = {
  Q01:'Alpha Clinic',Q02:'Layyah',Q03:'Owner-doctor',Q04:'03000000000',Q05:'GP',Q06:'1',Q07:['Consultation'],Q08:'Registered',Q09:'Yes',Q10:'Yes',Q11:'Organised and easy to retrieve',Q12:'Yes',Q13:'Yes',Q14:'Yes',Q15:'Yes',Q16:'Displayed/documented process',Q17:'Yes',Q19:'Yes'
};

// Q18 hidden unless dispensing is selected.
assert.equal(visibleQuestions(config, base).some(q=>q.id==='Q18'), false);
const dispensing = {...base, Q07:['Consultation','Dispensing medicines']};
assert.equal(visibleQuestions(config, dispensing).some(q=>q.id==='Q18'), true);

// Privacy-minimum persistence: unknown keys are dropped and no patient fields are produced.
const uncertain = {...dispensing, Q18:'Not sure', Q10:'Not sure', PATIENT_NAME:'Never persist'};
const result = evaluateSnapshot(config, uncertain);
const payload = buildPresalesPayload(config, uncertain, result, '10000000-0000-0000-0000-000000000001');
assert.equal(payload.clinic_name, 'Alpha Clinic');
assert.equal(payload.answers.PATIENT_NAME, undefined);
assert.deepEqual(Object.keys(payload).sort(), ['answers','clinic_name','contact','district_city','lead_status','pilot_status','respondent_role','snapshot_version','tenant_id','triggered_rule_ids'].sort());
assert.ok(payload.triggered_rule_ids.length <= 5);
assert.equal(payload.pilot_status, 'WAITLIST_UNTIL_PRODUCTION_PACK');

// Output remains preliminary and contains no score/pass-fail fields.
const model = snapshotOutputModel(config, uncertain, result);
assert.equal(model.prohibited_fields_present, false);
assert.equal('phc_score' in model, false);
assert.equal('compliance_pass_fail' in model, false);
assert.match(model.disclaimer, /not a PHC inspection score/i);
assert.equal(model.cta.price_pkr, 20000);
assert.equal(model.cta.duration_days, 30);

console.log('GP snapshot form/privacy tests PASS');
