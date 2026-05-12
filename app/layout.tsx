import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Strava Turf War',
  description:
    'A multiplayer territory-control game powered by your Strava rides. Claim streets. Defend your turf.',
  openGraph: {
    title: 'Strava Turf War',
    description: 'Claim the streets. Defend your turf.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="bg-zinc-950 text-zinc-100 antialiased min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
