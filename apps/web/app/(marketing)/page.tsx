import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="text-xl font-bold text-primary">creativeId</span>
          <nav className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/sign-up">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <Badge variant="secondary" className="mb-6 text-xs">
          MVP — Early Access
        </Badge>
        <h1 className="mx-auto max-w-3xl text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl">
          Your name in the credits.{' '}
          <span className="text-primary">Permanent. Portable. Yours.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          creativeId is a verified digital identity for creative and cultural industry professionals.
          Like ORCID — but for musicians, directors, photographers, writers, and everyone
          who makes culture.
        </p>
        <div className="mt-10 flex gap-4">
          <Button size="lg" asChild>
            <Link href="/sign-up">Create your creativeId</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="#how-it-works">How it works</Link>
          </Button>
        </div>
      </main>

      {/* How it works */}
      <section id="how-it-works" className="border-t bg-muted/40 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold">How it works</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {[
              {
                step: '01',
                title: 'Claim your identity',
                body: 'Sign up with your email or social account. Choose a handle — your permanent, portable creative identifier.',
              },
              {
                step: '02',
                title: 'Build your credits',
                body: 'Add your works — albums, films, plays, books — and your role in each. Invite collaborators to link their identities.',
              },
              {
                step: '03',
                title: 'Share and verify',
                body: 'Your public profile URL is your verified creative CV. Anyone can link to it or query the API.',
              },
            ].map(({ step, title, body }) => (
              <div key={step} className="rounded-lg border bg-card p-6">
                <span className="text-4xl font-black text-primary/30">{step}</span>
                <h3 className="mt-2 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>creativeId &copy; {new Date().getFullYear()} · A neutral identity layer for the creative industries</p>
      </footer>
    </div>
  );
}
