import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Providers } from '@/components/Providers';
import { Toaster } from '@/components/Toaster';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'creativeId — Your creative identity',
    template: '%s | creativeId',
  },
  description:
    'A persistent, portable, creator-owned identity for the creative and cultural industries.',
  openGraph: {
    type: 'website',
    siteName: 'creativeId',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body>
          <Providers>{children}</Providers>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
