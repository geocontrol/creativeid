import Image from 'next/image';
import Link from 'next/link';
import { type Discipline } from '@creativeid/types';
import { DisciplineBadge } from './DisciplineBadge';
import { cn } from '@/lib/utils';

interface IdentityCardProps {
  identity: {
    id: string;
    handle: string | null;
    displayName: string;
    avatarUrl: string | null;
    disciplines: string[] | null;
    connectionCount?: number;
  };
  className?: string;
}

export function IdentityCard({ identity, className }: IdentityCardProps) {
  const href = identity.handle ? `/${identity.handle}` : `/id/${identity.id}`;

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md',
        className,
      )}
    >
      {identity.avatarUrl ? (
        <Image
          src={identity.avatarUrl}
          alt={identity.displayName}
          width={48}
          height={48}
          className="h-12 w-12 rounded-full object-cover"
        />
      ) : (
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground"
          aria-hidden="true"
        >
          {identity.displayName[0]?.toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{identity.displayName}</p>
        {identity.handle && (
          <p className="truncate text-xs text-muted-foreground">@{identity.handle}</p>
        )}
        {identity.disciplines && identity.disciplines.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {identity.disciplines.slice(0, 3).map((d) => (
              <DisciplineBadge key={d} discipline={d as Discipline} />
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
