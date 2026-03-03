'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { workTypeValues } from '@creativeid/types';
import { trpc } from '@/lib/trpc';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function NewWorkPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [workType, setWorkType] = useState<(typeof workTypeValues)[number]>('album');
  const [year, setYear] = useState('');
  const [role, setRole] = useState('');
  const [roleNote, setRoleNote] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');

  const createWork = trpc.work.create.useMutation({
    onSuccess: () => {
      toast({ title: 'Work added', description: `"${title}" has been added to your profile.` });
      router.push('/profile');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate year is a plausible integer if provided
    const parsedYear = year ? Number(year) : null;
    if (year && (isNaN(parsedYear!) || !Number.isInteger(parsedYear))) return;
    createWork.mutate({
      title: title.trim(),
      workType,
      year: parsedYear,
      role: role.trim(),
      roleNote: roleNote.trim() || null,
      description: description.trim() || null,
      url: url.trim() || null,
    });
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Add a work</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Ellipse"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="workType">Type *</Label>
          <Select value={workType} onValueChange={(v) => setWorkType(v as typeof workType)}>
            <SelectTrigger id="workType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workTypeValues.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="year">Year</Label>
          <Input
            id="year"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="e.g. 2009"
            maxLength={4}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">Your role *</Label>
          <Input
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Composer & Vocalist"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="roleNote">Role detail (optional)</Label>
          <Input
            id="roleNote"
            value={roleNote}
            onChange={(e) => setRoleNote(e.target.value)}
            placeholder="e.g. Lead vocals, production"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="url">External link (optional)</Label>
          <Input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://open.spotify.com/…"
          />
        </div>

        {createWork.error && (
          <p className="text-sm text-destructive">{createWork.error.message}</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" asChild>
            <Link href="/profile">Cancel</Link>
          </Button>
          <Button
            type="submit"
            disabled={!title.trim() || !role.trim() || createWork.isPending}
            className="flex-1"
          >
            {createWork.isPending ? 'Saving…' : 'Add work'}
          </Button>
        </div>
      </form>
    </div>
  );
}
