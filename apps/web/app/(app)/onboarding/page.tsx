'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DISCIPLINES, type Discipline } from '@creativeid/types';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DisciplineBadge } from '@/components/DisciplineBadge';

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [displayName, setDisplayName] = useState('');
  const [selectedDisciplines, setSelectedDisciplines] = useState<Discipline[]>([]);

  // Step 2 state
  const [artistStatement, setArtistStatement] = useState('');
  const [biography, setBiography] = useState('');

  // Step 3 state
  const [handle, setHandle] = useState('');

  const createIdentity = trpc.identity.create.useMutation();
  const updateIdentity = trpc.identity.update.useMutation();
  const claimHandle = trpc.identity.setHandle.useMutation();

  const toggleDiscipline = (d: Discipline) => {
    setSelectedDisciplines((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };

  const handleStep1 = async () => {
    if (!displayName.trim() || selectedDisciplines.length === 0) return;
    await createIdentity.mutateAsync({
      displayName: displayName.trim(),
      disciplines: selectedDisciplines,
    });
    setStep(2);
  };

  const handleStep2 = async () => {
    if (artistStatement || biography) {
      await updateIdentity.mutateAsync({
        artistStatement: artistStatement || null,
        biography: biography || null,
      });
    }
    setStep(3);
  };

  const handleStep3 = async () => {
    if (handle.trim()) {
      try {
        await claimHandle.mutateAsync({ handle: handle.trim().toLowerCase() });
      } catch {
        // Handle error is shown in form; still proceed to dashboard
      }
    }
    router.push('/dashboard');
  };

  const skipStep3 = () => router.push('/dashboard');

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold">Set up your creativeId</h1>
        <p className="mt-1 text-sm text-muted-foreground">Step {step} of 3</p>
        <div className="mt-4 flex gap-2">
          {([1, 2, 3] as const).map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-secondary'}`}
            />
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name *</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Imogen Heap"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Disciplines * (choose all that apply)</Label>
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

          <Button
            onClick={() => void handleStep1()}
            disabled={!displayName.trim() || selectedDisciplines.length === 0 || createIdentity.isPending}
            className="w-full"
          >
            {createIdentity.isPending ? 'Saving…' : 'Continue'}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="statement">Artist statement</Label>
            <Textarea
              id="statement"
              value={artistStatement}
              onChange={(e) => setArtistStatement(e.target.value)}
              placeholder="A short statement about your practice (optional)"
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">{artistStatement.length}/500</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Biography</Label>
            <Textarea
              id="bio"
              value={biography}
              onChange={(e) => setBiography(e.target.value)}
              placeholder="Your professional biography (optional)"
              rows={6}
              maxLength={5000}
            />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => void handleStep2()} className="flex-1">
              Skip
            </Button>
            <Button
              onClick={() => void handleStep2()}
              disabled={updateIdentity.isPending}
              className="flex-1"
            >
              {updateIdentity.isPending ? 'Saving…' : 'Continue'}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="handle">Claim your handle</Label>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">creativeid.app/</span>
              <Input
                id="handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                placeholder="yourname"
                pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]|[a-z0-9]{3}"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              3–30 characters, lowercase letters, numbers and hyphens only. First-come-first-served.
            </p>
            {claimHandle.error && (
              <p className="text-xs text-destructive">{claimHandle.error.message}</p>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={skipStep3} className="flex-1">
              Skip for now
            </Button>
            <Button
              onClick={() => void handleStep3()}
              disabled={!handle.trim() || claimHandle.isPending}
              className="flex-1"
            >
              {claimHandle.isPending ? 'Checking…' : 'Claim handle & finish'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
