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

function computeCompleteness(identity: ProfileCompletenessProps['identity']): {
  score: number;
  missing: string[];
} {
  const checks: Array<[boolean, string]> = [
    [Boolean(identity.displayName), 'Display name'],
    [Boolean(identity.handle), 'Handle / username'],
    [Boolean(identity.disciplines?.length), 'At least one discipline'],
    [Boolean(identity.biography), 'Biography'],
    [Boolean(identity.avatarUrl), 'Profile photo'],
    [Boolean(identity.contentHash), 'Published profile'],
  ];

  const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);
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
            <li key={item} className="text-xs text-muted-foreground before:mr-1.5 before:content-['·']">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
