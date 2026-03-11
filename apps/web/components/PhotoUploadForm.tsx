'use client';

import { useState, useRef, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';

interface PhotographerResult {
  id: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
}

interface PhotoUploadFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function PhotoUploadForm({ onSuccess, onCancel }: PhotoUploadFormProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [description, setDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPhotographer, setSelectedPhotographer] = useState<PhotographerResult | null>(null);
  const [copyrightText, setCopyrightText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const debouncedQ = searchQuery.length >= 2 ? searchQuery : '';
  const { data: searchResults } = trpc.identity.search.useQuery(
    { q: debouncedQ },
    { enabled: debouncedQ.length >= 2 },
  );

  const createWork = trpc.work.create.useMutation();
  const addCredit = trpc.work.addCredit.useMutation();

  const handleFileChange = useCallback((selected: File) => {
    setFile(selected);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(selected);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFileChange(dropped);
    },
    [handleFileChange],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    try {
      setUploading(true);
      setUploadProgress(10);

      // Step 1: Get presigned URL.
      const uploadRes = await fetch('/api/upload/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, fileSize: file.size }),
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json() as { error?: string };
        throw new Error(err.error ?? 'Upload failed');
      }

      const { uploadUrl, publicUrl } = await uploadRes.json() as {
        uploadUrl: string;
        publicUrl: string;
      };

      setUploadProgress(30);

      // Step 2: PUT file directly to R2.
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!putRes.ok) throw new Error('Failed to upload file to storage');

      setUploadProgress(70);

      // Step 3: Create work record.
      // role is required by createWorkSchema; for photographs the server skips auto-credit.
      const work = await createWork.mutateAsync({
        title: title.trim(),
        workType: 'photograph',
        coverUrl: publicUrl,
        year: year ? parseInt(year, 10) : null,
        description: description.trim() || null,
        role: 'subject', // placeholder — ignored for work_type='photograph' server-side
      });

      setUploadProgress(85);

      // Step 4: Optionally add photographer credit.
      const hasCredit = selectedPhotographer ?? copyrightText.trim();
      if (hasCredit) {
        await addCredit.mutateAsync({
          workId: work.id,
          identityId: selectedPhotographer?.id ?? null,
          role: 'photographer',
          roleNote: copyrightText.trim() || null,
        });
      }

      setUploadProgress(100);
      toast({ title: 'Photo uploaded', description: `"${title}" added to your press photos.` });
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Upload failed', description: message, variant: 'destructive' });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="cursor-pointer rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-8 text-center transition hover:border-primary/70"
      >
        {preview ? (
          <img src={preview} alt="Preview" className="mx-auto max-h-40 rounded object-contain" />
        ) : (
          <>
            <p className="font-medium text-primary">Drop photo here or click to browse</p>
            <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG or WebP · max 10 MB</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChange(f); }}
        />
      </div>

      {/* Title */}
      <div>
        <label className="mb-1 block text-sm font-medium">
          Title <span className="text-destructive">*</span>
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Headshot 2024"
          required
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Year */}
      <div>
        <label className="mb-1 block text-sm font-medium">
          Year <span className="text-xs text-muted-foreground">(optional)</span>
        </label>
        <input
          value={year}
          onChange={(e) => setYear(e.target.value)}
          type="number"
          min={1800}
          max={new Date().getFullYear() + 5}
          className="w-24 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Photographer credit */}
      <div className="rounded-md border p-3 space-y-2">
        <p className="text-sm font-medium">
          Photographer credit <span className="text-xs text-muted-foreground">(optional)</span>
        </p>

        {selectedPhotographer ? (
          <div className="flex items-center justify-between rounded bg-primary/10 px-3 py-2 text-sm">
            <span className="font-medium">{selectedPhotographer.displayName}</span>
            <button type="button" onClick={() => setSelectedPhotographer(null)} className="text-muted-foreground hover:text-foreground">✕</button>
          </div>
        ) : (
          <div className="relative">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or @handle…"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {searchResults && searchResults.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow-sm">
                {searchResults.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => { setSelectedPhotographer(r); setSearchQuery(''); }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      {r.displayName}
                      {r.handle && <span className="ml-1 text-muted-foreground">@{r.handle}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <input
          value={copyrightText}
          onChange={(e) => setCopyrightText(e.target.value)}
          placeholder="© Name Year (free-text credit)"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Caption */}
      <div>
        <label className="mb-1 block text-sm font-medium">
          Caption <span className="text-xs text-muted-foreground">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={2000}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Progress */}
      {uploading && (
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!file || !title.trim() || uploading}
          className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : 'Upload photo'}
        </button>
        <button type="button" onClick={onCancel} disabled={uploading} className="rounded-md border px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
