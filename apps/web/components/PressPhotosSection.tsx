'use client';

import { useState } from 'react';
import Image from 'next/image';
import { PhotoLightbox, type LightboxPhoto } from './PhotoLightbox';

interface PressPhotosSectionProps {
  photos: LightboxPhoto[];
}

export function PressPhotosSection({ photos }: PressPhotosSectionProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Press Photos</h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setLightboxIndex(i)}
            className="group relative aspect-square overflow-hidden rounded-md bg-muted"
            aria-label={`View ${photo.title}`}
          >
            {photo.coverUrl && (
              <Image
                src={photo.coverUrl}
                alt={photo.title}
                fill
                className="object-cover transition group-hover:scale-105"
                sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 20vw"
              />
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 p-2 opacity-0 transition group-hover:opacity-100">
              <p className="truncate text-xs text-white">{photo.title}</p>
            </div>
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox photos={photos} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </section>
  );
}
