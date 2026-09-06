export function applyCampaignPresets(meta, defaults) {
  const result = {...meta};
  if (!result.time) result.time = defaults.time;
  if (!result.responsible?.trim() || defaults.legacyResponsible.includes(result.responsible)) {
    result.responsible = defaults.responsible;
  }
  return result;
}
