'use client';

import { useState } from 'react';
import { connectionTypeValues, type ConnectionType } from '@creativeid/types';
import { trpc } from '@/lib/trpc';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConnectionRequest } from '@/components/ConnectionRequest';
import { IdentityCard } from '@/components/IdentityCard';

export default function ConnectionsPage() {
  const utils = trpc.useUtils();
  const { data: identity } = trpc.identity.me.useQuery();
  const { data: pending, isLoading: loadingPending } = trpc.connection.pending.useQuery();
  const { data: accepted, isLoading: loadingAccepted } = trpc.connection.list.useQuery(
    { identityId: identity?.id ?? '' },
    { enabled: Boolean(identity?.id) },
  );

  // Send connection request
  const [searchHandle, setSearchHandle] = useState('');
  const [connType, setConnType] = useState<ConnectionType>('collaborated_with');
  const [connNote, setConnNote] = useState('');
  const [foundIdentity, setFoundIdentity] = useState<{
    id: string; ciid: string; handle: string | null;
    displayName: string; avatarUrl: string | null;
    disciplines: string[] | null; connectionCount: number;
  } | null>(null);
  const [searchError, setSearchError] = useState('');

  const searchQuery = trpc.identity.getByHandle.useQuery(
    { handle: searchHandle.trim().toLowerCase() },
    { enabled: false },
  );

  const requestMutation = trpc.connection.request.useMutation({
    onSuccess: () => {
      toast({ title: 'Request sent', description: `Connection request sent to ${foundIdentity?.displayName}.` });
      setFoundIdentity(null);
      setSearchHandle('');
      setConnNote('');
    },
    onError: (err) => {
      toast({ title: 'Could not send request', description: err.message, variant: 'destructive' });
    },
  });

  const removeMutation = trpc.connection.remove.useMutation({
    onSuccess: () => {
      void utils.connection.list.invalidate();
      toast({ title: 'Connection removed' });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleSearch = async () => {
    setSearchError('');
    setFoundIdentity(null);
    const result = await searchQuery.refetch();
    if (result.data) {
      if (result.data.id === identity?.id) {
        setSearchError("That's your own profile.");
      } else {
        setFoundIdentity(result.data as typeof foundIdentity);
      }
    } else {
      setSearchError('No profile found with that handle.');
    }
  };

  const typeLabels: Record<ConnectionType, string> = {
    collaborated_with: 'Collaborated with',
    bio_photo_by: 'Bio photo by',
    managed_by: 'Managed by',
    mentored_by: 'Mentored by',
  };

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Connections</h1>

      {/* Send connection request */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">Send a connection request</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Find a creator by their handle and confirm your creative relationship.
        </p>
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground text-sm">@</span>
              <Input
                value={searchHandle}
                onChange={(e) => { setSearchHandle(e.target.value.toLowerCase()); setFoundIdentity(null); setSearchError(''); }}
                placeholder="their-handle"
                className="pl-7"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => void handleSearch()}
              disabled={!searchHandle.trim() || searchQuery.isFetching}
            >
              {searchQuery.isFetching ? 'Searching…' : 'Find'}
            </Button>
          </div>

          {searchError && <p className="text-sm text-destructive">{searchError}</p>}

          {foundIdentity && (
            <div className="space-y-4 rounded-lg border p-4">
              <IdentityCard identity={foundIdentity} />
              <div className="space-y-2">
                <Label>Relationship type</Label>
                <Select value={connType} onValueChange={(v) => setConnType(v as ConnectionType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {connectionTypeValues.map((t) => (
                      <SelectItem key={t} value={t}>
                        {typeLabels[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Personal note (optional)</Label>
                <Input
                  value={connNote}
                  onChange={(e) => setConnNote(e.target.value)}
                  placeholder="e.g. We worked together on the 2023 tour"
                  maxLength={500}
                />
              </div>
              <Button
                onClick={() =>
                  requestMutation.mutate({
                    toIdentityId: foundIdentity.id,
                    type: connType,
                    note: connNote.trim() || null,
                  })
                }
                disabled={requestMutation.isPending}
                className="w-full"
              >
                {requestMutation.isPending ? 'Sending…' : `Send request to ${foundIdentity.displayName}`}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Pending requests */}
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

      {/* Accepted connections */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">
          Connections ({accepted?.length ?? 0})
        </h2>
        {loadingAccepted && <p className="text-muted-foreground">Loading…</p>}
        {!loadingAccepted && (!accepted || accepted.length === 0) && (
          <p className="text-sm text-muted-foreground">No connections yet.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {accepted?.map((conn) => (
            <div key={conn.id} className="group relative">
              <IdentityCard identity={conn.identity} />
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-2 hidden text-xs text-muted-foreground hover:text-destructive group-hover:flex"
                onClick={() => removeMutation.mutate({ connectionId: conn.id })}
                disabled={removeMutation.isPending}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
