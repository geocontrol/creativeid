'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from './ui/button';
import { IdentityCard } from './IdentityCard';
import { trpc } from '@/lib/trpc';

interface ConnectionRequestProps {
  connectionId: string;
  requester: {
    id: string;
    handle: string | null;
    displayName: string;
    avatarUrl: string | null;
    disciplines: string[] | null;
    connectionCount: number;
  };
  type: string;
  note: string | null;
  onResolved?: () => void;
}

export function ConnectionRequest({
  connectionId,
  requester,
  type,
  note,
  onResolved,
}: ConnectionRequestProps) {
  const utils = trpc.useUtils();

  const accept = trpc.connection.accept.useMutation({
    onSuccess: () => {
      void utils.connection.pending.invalidate();
      onResolved?.();
    },
  });

  const decline = trpc.connection.decline.useMutation({
    onSuccess: () => {
      void utils.connection.pending.invalidate();
      onResolved?.();
    },
  });

  const isLoading = accept.isPending || decline.isPending;

  return (
    <div className="rounded-lg border bg-card p-4">
      <IdentityCard identity={requester} className="border-0 p-0 shadow-none" />
      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Relationship:</span>{' '}
          {type.replace(/_/g, ' ')}
        </p>
        {note && (
          <p>
            <span className="font-medium text-foreground">Note:</span> {note}
          </p>
        )}
        <p className="text-xs">
          Accepting confirms you have a real creative relationship with this person.
        </p>
      </div>
      <div className="mt-4 flex gap-3">
        <Button
          size="sm"
          onClick={() => accept.mutate({ connectionId })}
          disabled={isLoading}
          className="gap-1"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => decline.mutate({ connectionId })}
          disabled={isLoading}
          className="gap-1"
        >
          <XCircle className="h-4 w-4" aria-hidden="true" />
          Decline
        </Button>
      </div>
    </div>
  );
}
