import Link from 'next/link';
import { type WorkType } from '@creativeid/types';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

const workTypeLabels: Record<WorkType, string> = {
  album: 'Album',
  film: 'Film',
  play: 'Play',
  exhibition: 'Exhibition',
  book: 'Book',
  other: 'Other',
};

interface WorkCardProps {
  work: {
    id: string;
    title: string;
    workType: string;
    year: number | null;
  };
  role?: string;
  className?: string;
}

export function WorkCard({ work, role, className }: WorkCardProps) {
  return (
    <Link
      href={`/work/${work.id}`}
      className={cn(
        'flex items-start justify-between rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{work.title}</p>
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary" className="text-xs">
            {workTypeLabels[work.workType as WorkType] ?? work.workType}
          </Badge>
          {work.year && <span>{work.year}</span>}
          {role && <span>· {role}</span>}
        </div>
      </div>
    </Link>
  );
}
