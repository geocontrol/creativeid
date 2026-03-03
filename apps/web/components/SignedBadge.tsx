import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SignedBadgeProps {
  className?: string;
}

export function SignedBadge({ className }: SignedBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800',
        className,
      )}
      title="This profile has been signed and published"
    >
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      Signed
    </span>
  );
}
