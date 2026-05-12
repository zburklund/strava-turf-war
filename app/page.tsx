import { cookies } from 'next/headers'
import Link from 'next/link'

export default async function Home() {
  const cookieStore = await cookies()
  const isLoggedIn = !!cookieStore.get('strava_turf_user_id')?.value

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4">
      {/* Header */}
      <div className="text-center max-w-xl">
        <div className="text-6xl mb-4">🚴</div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-3">
          Strava Turf War
        </h1>
        <p className="text-xl text-gray-400 mb-2">
          Claim the streets. Defend your turf.
        </p>
        <p className="text-gray-500 text-sm mb-10 leading-relaxed">
          Ride your bike. Every time your route loops back on itself, you claim
          the enclosed area as territory. Other riders can steal your patches by
          overlapping more than half of your polygon with theirs. The map shows
          who owns what — in real time.
        </p>

        {isLoggedIn ? (
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
            <Link
              href="/map"
              className="bg-orange-500 hover:bg-orange-400 transition text-white font-bold py-3 px-8 rounded-xl text-lg shadow-lg"
            >
              Go to Map →
            </Link>
            <a
              href="/api/auth/logout"
              className="text-gray-500 hover:text-gray-300 text-sm underline"
            >
              Sign out
            </a>
          </div>
        ) : (
          <a
            href="/api/auth/strava"
            className="inline-flex items-center gap-3 bg-orange-500 hover:bg-orange-400 transition text-white font-bold py-3 px-8 rounded-xl text-lg shadow-lg"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6 fill-current"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
            Connect with Strava
          </a>
        )}
      </div>

      {/* How it works */}
      <div className="mt-20 max-w-2xl w-full grid sm:grid-cols-3 gap-6 text-center">
        {[
          {
            emoji: '🔗',
            title: 'Connect Strava',
            desc: 'Link your Strava account once. New rides sync automatically via webhook.',
          },
          {
            emoji: '🗺️',
            title: 'Ride & Enclose',
            desc: 'Any interior area enclosed by a self-crossing route becomes your territory.',
          },
          {
            emoji: '⚔️',
            title: 'Steal or Defend',
            desc: 'Cover more than 50 % of an opponent\'s polygon with your own to capture it.',
          },
        ].map((card) => (
          <div
            key={card.title}
            className="bg-gray-900 border border-gray-800 rounded-xl p-5"
          >
            <div className="text-3xl mb-2">{card.emoji}</div>
            <h3 className="font-semibold mb-1">{card.title}</h3>
            <p className="text-gray-500 text-sm">{card.desc}</p>
          </div>
        ))}
      </div>

      <footer className="mt-16 text-gray-700 text-xs">
        Map data © OpenStreetMap contributors
      </footer>
    </main>
  )
}
