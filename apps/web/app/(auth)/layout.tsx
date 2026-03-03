import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4">
      <div className="mb-6 text-center">
        <Link href="/" className="text-2xl font-bold text-primary">
          creativeId
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">
          Your creative identity, permanent and portable
        </p>
      </div>
      {children}
    </div>
  );
}
