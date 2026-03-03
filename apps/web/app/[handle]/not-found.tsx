import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HandleNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/" className="text-sm font-semibold text-primary">
            creativeId
          </Link>
        </div>
      </header>
      <main className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-2xl font-bold">Profile not found</h1>
        <p className="max-w-sm text-muted-foreground">
          There&apos;s no creativeId at this address. The handle may never have been claimed, or
          the creator may have changed theirs.
        </p>
        <div className="mt-2 flex gap-3">
          <Button asChild variant="outline">
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">Create your creativeId</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
