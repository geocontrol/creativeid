import Link from 'next/link';
import { Progress } from './ui/progress';
import { cn } from '@/lib/utils';

interface ProfileCompletenessProps {
  identity: {
    displayName: string;
    handle: string | null;
    disciplines: string[] | null;
    biography: string | null;
    avatarUrl: string | null;
    contentHash: string | null;
  };
  className?: string;
}

type MissingItem = { label: string; href: string };

function computeCompleteness(identity: ProfileCompletenessProps['identity']): {
  score: number;
  missing: MissingItem[];
} {
  const checks: Array<[boolean, MissingItem]> = [
    [Boolean(identity.displayName), { label: 'Display name', href: '/profile' }],
    [Boolean(identity.handle), { label: 'Claim your handle', href: '/profile' }],
    [Boolean(identity.disciplines?.length), { label: 'Add a discipline', href: '/profile' }],
    [Boolean(identity.biography), { label: 'Write a biography', href: '/profile' }],
    [Boolean(identity.avatarUrl), { label: 'Upload a profile photo', href: '/profile' }],
    [Boolean(identity.contentHash), { label: 'Publish your profile', href: '/profile' }],
  ];

  const missing = checks.filter(([ok]) => !ok).map(([, item]) => item);
  const score = Math.round(((checks.length - missing.length) / checks.length) * 100);
  return { score, missing };
}

export function ProfileCompleteness({ identity, className }: ProfileCompletenessProps) {
  const { score, missing } = computeCompleteness(identity);

  return (
    <div className={cn('rounded-lg border bg-card p-5', className)}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Profile completeness</h3>
        <span className="text-sm font-medium text-primary">{score}%</span>
      </div>
      <Progress value={score} className="mt-2 h-2" />
      {missing.length > 0 && (
        <ul className="mt-3 space-y-1">
          {missing.map((item) => (
            <li key={item.label} className="text-xs before:mr-1.5 before:content-['·']">
              <Link href={item.href} className="text-primary hover:underline">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
