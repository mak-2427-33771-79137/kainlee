// Constants safe to use in browser components.
export const CATEGORIES = [
  { id: 'officer', label: 'Serving Officer', short: 'Officers' },
  { id: 'veteran', label: 'Veteran', short: 'Veterans' },
  { id: 'jco_or', label: 'JCO / OR', short: 'JCOs & ORs' },
  { id: 'veer_nari', label: 'Veer Nari', short: 'Veer Naris' },
  { id: 'civilian', label: 'Civilian Guest', short: 'Civilians' },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;

export const RELATIONS = ['self', 'spouse', 'son', 'daughter', 'father', 'mother', 'other'];
export const FAMILY_RELATIONS = ['self', 'spouse', 'son', 'daughter']; // not counted against the extras cap
export const AGE_GROUPS = ['adult', 'child', 'infant'];
export const RELATION_LABEL = { self: 'Self', spouse: 'Spouse', son: 'Son', daughter: 'Daughter', father: 'Father', mother: 'Mother', other: 'Other guest' };
export const AGE_LABEL = { adult: 'Adult', child: 'Child (5–12)', infant: 'Under 5' };

