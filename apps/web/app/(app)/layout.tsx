import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { NavLinks } from '@/components/NavLinks';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/dashboard" className="font-semibold text-primary">
            creativeId
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <NavLinks />
            <UserButton afterSignOutUrl="/" />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
