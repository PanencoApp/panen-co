# Supabase setup for Panen&Co

## 1. Install the Supabase client

Run this in the project folder:

```powershell
cd C:\Users\eloyc\Documents\Codex\2026-06-29\tu\panen-co
npm.cmd install @supabase/supabase-js
```

If Windows blocks it, close the dev server, open PowerShell again, and retry.

## 2. Create the Supabase project

1. Go to https://supabase.com
2. Create a project named `panen-co`
3. Open `Project Settings > API`
4. Copy:
   - Project URL
   - anon public key

## 3. Create `.env.local`

Copy `.env.example` into `.env.local`, then fill:

```txt
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Never share the service role key in the frontend.

## 4. Create the database tables

In Supabase:

1. Open `SQL Editor`
2. Paste the content of `supabase/schema.sql`
3. Run it

## 5. Next code step

After the package is installed and `.env.local` is filled, create:

- `lib/supabase/client.ts`
- real signup/login functions
- profile loading
- prediction saving
