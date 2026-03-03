import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function WorkNotFound() {
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
        <h1 className="text-2xl font-bold">Work not found</h1>
        <p className="text-muted-foreground">This work may have been removed or the link is incorrect.</p>
        <Button asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      </main>
    </div>
  );
}
