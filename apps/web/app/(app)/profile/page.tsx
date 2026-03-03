'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DISCIPLINES, type Discipline } from '@creativeid/types';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WorkCard } from '@/components/WorkCard';
import { DisciplineBadge } from '@/components/DisciplineBadge';
import { SignedBadge } from '@/components/SignedBadge';

export default function ProfilePage() {
  const { data: identity, isLoading } = trpc.identity.me.useQuery();
  const { data: worksData } = trpc.work.list.useQuery(
    { identityId: identity?.id ?? '' },
    { enabled: Boolean(identity?.id) },
  );

  const updateMutation = trpc.identity.update.useMutation();
  const setHandleMutation = trpc.identity.setHandle.useMutation();
  const publishMutation = trpc.identity.publish.useMutation();
  const utils = trpc.useUtils();

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [biography, setBiography] = useState('');
  const [artistStatement, setArtistStatement] = useState('');
  const [handle, setHandle] = useState('');
  const [selectedDisciplines, setSelectedDisciplines] = useState<Discipline[]>([]);

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Loading…</div>;
  if (!identity) return null;

  const startEditing = () => {
    setDisplayName(identity.displayName);
    setBiography(identity.biography ?? '');
    setArtistStatement(identity.artistStatement ?? '');
    setHandle(identity.handle ?? '');
    setSelectedDisciplines((identity.disciplines ?? []) as Discipline[]);
    setEditing(true);
  };

  const saveChanges = async () => {
    await updateMutation.mutateAsync({
      displayName,
      biography: biography || null,
      artistStatement: artistStatement || null,
      disciplines: selectedDisciplines,
    });

    if (handle !== identity.handle && handle.trim()) {
      await setHandleMutation.mutateAsync({ handle: handle.trim() });
    }

    await utils.identity.me.invalidate();
    setEditing(false);
  };

  const publish = async () => {
    await publishMutation.mutateAsync();
    await utils.identity.me.invalidate();
  };

  const toggleDiscipline = (d: Discipline) => {
    setSelectedDisciplines((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Profile</h1>
        <div className="flex gap-2">
          {!editing && (
            <>
              <Button variant="outline" onClick={startEditing}>
                Edit
              </Button>
              <Button onClick={() => void publish()} disabled={publishMutation.isPending}>
                {publishMutation.isPending ? 'Publishing…' : 'Publish'}
              </Button>
            </>
          )}
          {editing && (
            <>
              <Button variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button onClick={() => void saveChanges()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        {editing ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Display name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Handle</Label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">creativeid.app/</span>
                <Input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} />
              </div>
              {setHandleMutation.error && (
                <p className="text-xs text-destructive">{setHandleMutation.error.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Disciplines</Label>
              <div className="flex flex-wrap gap-2">
                {DISCIPLINES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDiscipline(d)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      selectedDisciplines.includes(d)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-accent'
                    }`}
                  >
                    {d.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Artist statement</Label>
              <Textarea
                value={artistStatement}
                onChange={(e) => setArtistStatement(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label>Biography</Label>
              <Textarea
                value={biography}
                onChange={(e) => setBiography(e.target.value)}
                rows={6}
                maxLength={5000}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{identity.displayName}</h2>
              {identity.contentHash && <SignedBadge />}
            </div>
            {identity.handle && (
              <p className="text-sm text-muted-foreground">
                <Link href={`/${identity.handle}`} className="text-primary hover:underline">
                  creativeid.app/{identity.handle}
                </Link>
              </p>
            )}
            {identity.disciplines && identity.disciplines.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {identity.disciplines.map((d) => (
                  <DisciplineBadge key={d} discipline={d as Discipline} />
                ))}
              </div>
            )}
            {identity.artistStatement && (
              <p className="italic text-muted-foreground">&ldquo;{identity.artistStatement}&rdquo;</p>
            )}
            {identity.biography && <p className="whitespace-pre-line text-sm">{identity.biography}</p>}
            <p className="font-mono text-xs text-muted-foreground">CIID: {identity.ciid}</p>
          </div>
        )}
      </div>

      {/* Works list */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Works</h2>
          <Button size="sm" asChild>
            <Link href="/profile/works/new">+ Add work</Link>
          </Button>
        </div>
        {!worksData?.length ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">No works yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {worksData.map((work) => (
              <WorkCard key={work.id} work={work} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
