# PageTalk

A Reddit-style discussion forum embedded in Chrome where every conversation is indexed by the page URL. Visit any article, open the extension, and discuss it with anyone else running PageTalk on the same page.

## How it works

1. When you open the extension it reads the current tab's URL.
2. The URL is normalized (tracking params stripped, lowercased) and SHA-256 hashed into a thread ID.
3. That ID is used as the primary key in a shared Supabase database.
4. All users visiting the same URL see the same thread.

## Features

- **Per-URL threads** — SHA-256 hash of the normalized URL is the thread ID
- **Tracking-param stripping** — `utm_source`, `fbclid`, `gclid`, etc. are removed before hashing
- **Nested replies** — up to 6 levels deep with visual indentation
- **Voting** — upvote / downvote with toggle-off; atomic via a PostgreSQL function
- **Three sort modes** — Hot, New, Top
- **Anonymous identity** — random user ID generated once and stored locally
- **Retroactive display name** — changing your name updates all past comments

## Setup

See [SETUP.md](SETUP.md) for the full Supabase schema and configuration steps.

## Privacy

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## License

MIT
