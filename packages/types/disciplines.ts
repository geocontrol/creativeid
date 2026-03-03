export const DISCIPLINES = [
  'musician',
  'composer',
  'producer',
  'visual-artist',
  'photographer',
  'actor',
  'director',
  'playwright',
  'choreographer',
  'designer',
  'writer',
  'other',
] as const;

export type Discipline = (typeof DISCIPLINES)[number];
