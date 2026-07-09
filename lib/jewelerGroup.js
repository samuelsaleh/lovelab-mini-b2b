export const JEWELER_GROUP = {
  AUCUN: 'AUCUN',
  SYNALIA: 'SYNALIA',
  MG: 'MG',
  JOAILLIERS_ORFEVRES: 'JOAILLIERS_ORFEVRES',
};

export const JEWELER_GROUP_OPTIONS = [
  { value: JEWELER_GROUP.AUCUN, labelKey: 'order.jewelerGroupNone', label: 'Aucun' },
  { value: JEWELER_GROUP.SYNALIA, labelKey: 'order.jewelerGroupSynalia', label: 'SYNALIA' },
  { value: JEWELER_GROUP.MG, labelKey: 'order.jewelerGroupMg', label: 'MG' },
  { value: JEWELER_GROUP.JOAILLIERS_ORFEVRES, labelKey: 'order.jewelerGroupJoailliersOrfevres', label: 'JOAILLIERS ORFEVRES' },
];

const VALID_GROUPS = new Set(JEWELER_GROUP_OPTIONS.map((opt) => opt.value));

export function normalizeJewelerGroup(raw) {
  if (typeof raw !== 'string') return JEWELER_GROUP.AUCUN;
  const normalized = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return VALID_GROUPS.has(normalized) ? normalized : JEWELER_GROUP.AUCUN;
}

export function isValidJewelerGroup(raw) {
  if (typeof raw !== 'string') return false;
  return VALID_GROUPS.has(raw.trim().toUpperCase().replace(/[\s-]+/g, '_'));
}

export function getJewelerGroupLabel(group) {
  const normalized = normalizeJewelerGroup(group);
  return JEWELER_GROUP_OPTIONS.find((opt) => opt.value === normalized)?.label || 'Aucun';
}

export function isSynaliaJewelerGroup(group) {
  return normalizeJewelerGroup(group) === JEWELER_GROUP.SYNALIA;
}

export function jewelerGroupFromLegacy(metadataOrFormState) {
  const source = metadataOrFormState || {};
  const formState = source.formState || {};
  const explicit = formState.jewelerGroup ?? source.jewelerGroup;
  if (explicit != null) return normalizeJewelerGroup(explicit);

  if (
    formState.synaliaEnabled === true
    || formState.synalia === true
    || source.synaliaEnabled === true
    || source.synalia === true
  ) {
    return JEWELER_GROUP.SYNALIA;
  }

  return JEWELER_GROUP.AUCUN;
}
