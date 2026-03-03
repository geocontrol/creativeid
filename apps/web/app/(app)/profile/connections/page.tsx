'use client';

import { trpc } from '@/lib/trpc';
import { ConnectionRequest } from '@/components/ConnectionRequest';
import { IdentityCard } from '@/components/IdentityCard';

export default function ConnectionsPage() {
  const { data: identity } = trpc.identity.me.useQuery();
  const { data: pending, isLoading: loadingPending } = trpc.connection.pending.useQuery();
  const { data: accepted, isLoading: loadingAccepted } = trpc.connection.list.useQuery(
    { identityId: identity?.id ?? '' },
    { enabled: Boolean(identity?.id) },
  );

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Connections</h1>

      <section>
        <h2 className="mb-4 text-lg font-semibold">
          Pending requests
          {pending && pending.length > 0 && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {pending.length}
            </span>
          )}
        </h2>
        {loadingPending && <p className="text-muted-foreground">Loading…</p>}
        {!loadingPending && (!pending || pending.length === 0) && (
          <p className="text-sm text-muted-foreground">No pending requests.</p>
        )}
        <div className="space-y-4">
          {pending?.map((req) => (
            <ConnectionRequest
              key={req.id}
              connectionId={req.id}
              requester={req.requester}
              type={req.type}
              note={req.note}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">
          Accepted connections ({accepted?.length ?? 0})
        </h2>
        {loadingAccepted && <p className="text-muted-foreground">Loading…</p>}
        {!loadingAccepted && (!accepted || accepted.length === 0) && (
          <p className="text-sm text-muted-foreground">No connections yet.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {accepted?.map((conn) => (
            <IdentityCard key={conn.id} identity={conn.identity} />
          ))}
        </div>
      </section>
    </div>
  );
}
