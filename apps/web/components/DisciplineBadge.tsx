import { type Discipline } from '@creativeid/types';
import { cn } from '@/lib/utils';

const disciplineColours: Record<Discipline, string> = {
  musician: 'bg-violet-100 text-violet-800',
  composer: 'bg-purple-100 text-purple-800',
  producer: 'bg-indigo-100 text-indigo-800',
  'visual-artist': 'bg-pink-100 text-pink-800',
  photographer: 'bg-rose-100 text-rose-800',
  actor: 'bg-amber-100 text-amber-800',
  director: 'bg-orange-100 text-orange-800',
  playwright: 'bg-yellow-100 text-yellow-800',
  choreographer: 'bg-teal-100 text-teal-800',
  designer: 'bg-cyan-100 text-cyan-800',
  writer: 'bg-blue-100 text-blue-800',
  other: 'bg-gray-100 text-gray-800',
};

interface DisciplineBadgeProps {
  discipline: Discipline;
  className?: string;
}

export function DisciplineBadge({ discipline, className }: DisciplineBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        disciplineColours[discipline],
        className,
      )}
    >
      {discipline.replace('-', ' ')}
    </span>
  );
}
