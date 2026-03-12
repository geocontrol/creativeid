'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export interface LightboxPhoto {
  id: string;
  title: string;
  coverUrl: string | null;
  year: number | null;
  description: string | null;
  photographerName: string | null;
  photographerHandle: string | null;
}

interface PhotoLightboxProps {
  photos: LightboxPhoto[];
  initialIndex: number;
  onClose: () => void;
}

export function PhotoLightbox({ photos, initialIndex, onClose }: PhotoLightboxProps) {
  const [current, setCurrent] = useState(initialIndex);
  const photo = photos[current];

  const prev = useCallback(() => setCurrent((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setCurrent((i) => Math.min(photos.length - 1, i + 1)), [photos.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, prev, next]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-background" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1 text-white hover:bg-black/70" aria-label="Close">✕</button>

        {photo.coverUrl && (
          <div className="relative max-h-[60vh] w-full bg-black">
            <Image src={photo.coverUrl} alt={photo.title} width={900} height={600} className="mx-auto max-h-[60vh] w-auto object-contain" />
          </div>
        )}

        <div className="space-y-1 p-4">
          <p className="font-semibold">{photo.title}</p>
          {photo.year && <p className="text-sm text-muted-foreground">{photo.year}</p>}
          {photo.description && <p className="text-sm text-muted-foreground">{photo.description}</p>}
          {photo.photographerName && (
            <p className="text-sm text-muted-foreground">
              Photo:{' '}
              {photo.photographerHandle ? (
                <Link href={`/${photo.photographerHandle}`} className="underline hover:text-foreground">{photo.photographerName}</Link>
              ) : photo.photographerName}
            </p>
          )}
        </div>

        {photos.length > 1 && (
          <div className="flex justify-between border-t px-4 py-2 text-sm text-muted-foreground">
            <button onClick={prev} disabled={current === 0} className="disabled:opacity-30">← Previous</button>
            <span>{current + 1} / {photos.length}</span>
            <button onClick={next} disabled={current === photos.length - 1} className="disabled:opacity-30">Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
