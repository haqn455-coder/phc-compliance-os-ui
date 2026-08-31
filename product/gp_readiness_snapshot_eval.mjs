export function evaluateSnapshot(config, answers) {
  if (!config || config.config_version !== 'GP_READINESS_SNAPSHOT_V0_1') throw new Error('unsupported snapshot config');
  const triggered = [];
  const answer = (id) => answers?.[id];
  const contains = (value, needle) => Array.isArray(value) ? value.includes(needle) : String(value ?? '').split('|').map(s=>s.trim()).includes(needle);
  for (const rule of config.rules ?? []) {
    if (rule.requires) {
      const rv = answer(rule.requires.question);
      if (rule.requires.contains && !contains(rv, rule.requires.contains)) continue;
    }
    const v = answer(rule.question);
    if (!Array.isArray(rule.in) || !rule.in.includes(v)) continue;
    triggered.push({
      rule_id: rule.id,
      priority: rule.priority,
      gap: rule.gap,
      next_action: rule.action,
      evidence_to_prepare: rule.evidence,
      verification_required: String(v).toLowerCase().includes('not sure') || String(v).toLowerCase().includes('unsure'),
      safety: rule.safety ?? 'flag_only'
    });
  }
  triggered.sort((a,b) => (b.priority-a.priority) || a.rule_id.localeCompare(b.rule_id));
  return {
    snapshot_version: config.config_version,
    result_type: 'PRELIMINARY_READINESS_SNAPSHOT',
    disclaimer: config.disclaimer,
    flagged_actions: triggered.slice(0, config.max_preview_gaps ?? 5),
    cta: config.cta,
    phc_score: null,
    compliance_pass_fail: null
  };
}
