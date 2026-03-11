'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { PhotoUploadForm } from './PhotoUploadForm';
import type { Work } from '@creativeid/db';

const PHOTO_LIMIT = 20;

interface SortablePhotoRowProps {
  photo: Work;
  onSetAvatar: (id: string) => void;
  onDelete: (id: string) => void;
}

function SortablePhotoRow({ photo, onSetAvatar, onDelete }: SortablePhotoRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${photo.isAvatar ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}
    >
      <button {...attributes} {...listeners} type="button" className="cursor-grab touch-none text-muted-foreground" aria-label="Drag to reorder">⠿</button>

      {photo.coverUrl && (
        <img src={photo.coverUrl} alt={photo.title} width={40} height={40} className="h-10 w-10 flex-shrink-0 rounded object-cover" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{photo.title}</p>
        {photo.year && <p className="truncate text-xs text-muted-foreground">{photo.year}</p>}
      </div>

      {photo.isAvatar ? (
        <span className="whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">✓ Avatar</span>
      ) : (
        <button type="button" onClick={() => onSetAvatar(photo.id)} className="whitespace-nowrap rounded-full border border-primary px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10">Set avatar</button>
      )}

      <button type="button" onClick={() => onDelete(photo.id)} className="ml-1 text-muted-foreground hover:text-destructive" aria-label="Delete photo">✕</button>
    </div>
  );
}

interface PhotoManagerProps {
  identityId: string;
  initialPhotos: Work[];
}

export function PhotoManager({ identityId, initialPhotos }: PhotoManagerProps) {
  const { toast } = useToast();
  const [photos, setPhotos] = useState<Work[]>(
    [...initialPhotos].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
  );
  const [showUploadForm, setShowUploadForm] = useState(false);

  const utils = trpc.useUtils();
  const setAsAvatar = trpc.work.setAsAvatar.useMutation({
    onSuccess: () => { void utils.work.listPhotos.invalidate({ identityId }); toast({ title: 'Avatar updated' }); },
  });
  const deletePhoto = trpc.work.delete.useMutation({
    onSuccess: () => { void utils.work.listPhotos.invalidate({ identityId }); },
  });
  const reorderPhotos = trpc.work.reorderPhotos.useMutation();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = photos.findIndex((p) => p.id === active.id);
    const newIndex = photos.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(photos, oldIndex, newIndex);
    setPhotos(reordered); // optimistic
    try {
      await reorderPhotos.mutateAsync({ photoIds: reordered.map((p) => p.id) });
    } catch {
      setPhotos(photos); // revert
      toast({ title: 'Reorder failed', variant: 'destructive' });
    }
  };

  const handleDelete = async (workId: string) => {
    if (!confirm('Delete this photo?')) return;
    setPhotos((prev) => prev.filter((p) => p.id !== workId)); // optimistic
    try {
      await deletePhoto.mutateAsync({ workId });
      toast({ title: 'Photo deleted' });
    } catch {
      void utils.work.listPhotos.invalidate({ identityId });
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Press Photos <span className="font-normal text-muted-foreground">{photos.length} / {PHOTO_LIMIT}</span>
        </h3>
        {photos.length < PHOTO_LIMIT && !showUploadForm && (
          <button type="button" onClick={() => setShowUploadForm(true)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">+ Add photo</button>
        )}
      </div>

      {showUploadForm && (
        <div className="rounded-lg border p-4">
          <PhotoUploadForm
            onSuccess={() => { setShowUploadForm(false); void utils.work.listPhotos.invalidate({ identityId }); }}
            onCancel={() => setShowUploadForm(false)}
          />
        </div>
      )}

      {photos.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">Drag to reorder · first photo leads the press section</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={photos.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {photos.map((photo) => (
                  <SortablePhotoRow key={photo.id} photo={photo} onSetAvatar={(id) => setAsAvatar.mutate({ photoId: id })} onDelete={handleDelete} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      {photos.length === 0 && !showUploadForm && (
        <p className="text-sm text-muted-foreground">No press photos yet.</p>
      )}
    </div>
  );
}
