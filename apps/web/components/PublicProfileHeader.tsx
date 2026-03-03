import Image from 'next/image';
import { type Discipline } from '@creativeid/types';
import { DisciplineBadge } from './DisciplineBadge';
import { SignedBadge } from './SignedBadge';
import { TrustIndicator } from './TrustIndicator';

interface PublicProfileHeaderProps {
  identity: {
    displayName: string;
    handle: string | null;
    avatarUrl: string | null;
    disciplines: string[] | null;
    connectionCount: number;
    contentHash: string | null;
    artistStatement: string | null;
  };
}

export function PublicProfileHeader({ identity }: PublicProfileHeaderProps) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      {identity.avatarUrl ? (
        <Image
          src={identity.avatarUrl}
          alt={identity.displayName}
          width={128}
          height={128}
          className="h-32 w-32 rounded-full object-cover ring-4 ring-background"
          priority
        />
      ) : (
        <div className="flex h-32 w-32 flex-shrink-0 items-center justify-center rounded-full bg-primary text-4xl font-bold text-primary-foreground ring-4 ring-background">
          {identity.displayName[0]?.toUpperCase()}
        </div>
      )}

      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{identity.displayName}</h1>
          {identity.contentHash && <SignedBadge />}
        </div>

        {identity.handle && (
          <p className="mt-1 text-muted-foreground">@{identity.handle}</p>
        )}

        {identity.disciplines && identity.disciplines.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {identity.disciplines.map((d) => (
              <DisciplineBadge key={d} discipline={d as Discipline} />
            ))}
          </div>
        )}

        <div className="mt-3">
          <TrustIndicator connectionCount={identity.connectionCount} />
        </div>

        {identity.artistStatement && (
          <p className="mt-4 text-muted-foreground italic">&ldquo;{identity.artistStatement}&rdquo;</p>
        )}
      </div>
    </div>
  );
}
