export function visibleQuestions(config, answers = {}) {
  return (config.questions ?? []).filter(q => {
    if (!q.show_if) return true;
    const v = answers[q.show_if.question];
    if (q.show_if.contains) {
      return Array.isArray(v) ? v.includes(q.show_if.contains) : String(v ?? '').split('|').map(s=>s.trim()).includes(q.show_if.contains);
    }
    return true;
  });
}

export function buildPresalesPayload(config, answers, evalResult, tenantId) {
  const allowed = new Set((config.questions ?? []).map(q => q.id));
  const cleanAnswers = {};
  for (const [k,v] of Object.entries(answers ?? {})) {
    if (allowed.has(k)) cleanAnswers[k] = v;
  }
  const required = ['Q01','Q02','Q03','Q04'];
  for (const k of required) {
    if (cleanAnswers[k] == null || String(cleanAnswers[k]).trim() === '') throw new Error('missing required presales field '+k);
  }
  return {
    tenant_id: tenantId,
    snapshot_version: config.config_version,
    clinic_name: String(cleanAnswers.Q01).trim(),
    district_city: String(cleanAnswers.Q02).trim(),
    respondent_role: String(cleanAnswers.Q03).trim(),
    contact: String(cleanAnswers.Q04).trim(),
    answers: cleanAnswers,
    triggered_rule_ids: (evalResult?.flagged_actions ?? []).map(x=>x.rule_id).slice(0,5),
    lead_status: 'SNAPSHOT_CREATED',
    pilot_status: 'WAITLIST_UNTIL_PRODUCTION_PACK'
  };
}

export function snapshotOutputModel(config, answers, evalResult) {
  const clinic = String(answers?.Q01 ?? '').trim();
  const location = String(answers?.Q02 ?? '').trim();
  const type = String(answers?.Q05 ?? 'Not stated');
  const licence = String(answers?.Q08 ?? 'Not stated');
  return {
    title: 'PHC Clinic Ready — Preliminary Readiness Snapshot',
    clinic,
    location,
    clinic_type: type,
    licence_stage_as_reported: licence,
    actions: evalResult?.flagged_actions ?? [],
    disclaimer: config.disclaimer,
    cta: config.cta,
    prohibited_fields_present: false
  };
}
