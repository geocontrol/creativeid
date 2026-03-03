import { Users } from 'lucide-react';

interface TrustIndicatorProps {
  connectionCount: number;
  mutualCount?: number; // "connected to N identities you know" — only shown when authenticated
}

export function TrustIndicator({ connectionCount, mutualCount }: TrustIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Users className="h-4 w-4" aria-hidden="true" />
      <span>
        <strong className="text-foreground">{connectionCount}</strong>{' '}
        {connectionCount === 1 ? 'verified connection' : 'verified connections'}
        {mutualCount !== undefined && mutualCount > 0 && (
          <span className="ml-1 text-primary">· {mutualCount} you know</span>
        )}
      </span>
    </div>
  );
}
