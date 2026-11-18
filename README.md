# Intently

Plan tomorrow on purpose, and keep a few habits going. No build step — plain HTML/CSS/JS, backed by Supabase so the same data shows up on your PC and your phone.

## 1. Create the Supabase project

1. Go to https://supabase.com, create a free account and a new project.
2. Open the **SQL Editor** and run:

```sql
create table intentions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  for_date date not null,
  activity text not null,
  reason text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  kind text not null default 'once' check (kind in ('once', 'multi', 'duration')),
  xp_value integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  habit_id uuid not null references habits(id) on delete cascade,
  for_date date not null,
  value integer not null default 0,
  unique (habit_id, for_date)
);

alter table intentions enable row level security;
alter table habits enable row level security;
alter table habit_logs enable row level security;

create policy "owner access" on intentions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on habits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner access" on habit_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

3. Go to **Authentication → Users** and manually add yourself as a user (email + password). This is a single-user app, so no public sign-up screen is needed.
4. Go to **Project Settings → API** and copy the **Project URL** and **anon public key**.

## 2. Configure the app

Edit `config.js`:

```js
window.INTENTLY_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY",
};
```

The anon key is meant to be public client-side — Row Level Security (the policies above) is what actually protects your data, not keeping this key secret.

## 3. Try it locally

Any static file server works, e.g. from this folder:

```bash
python -m http.server 8000
```

Then open http://localhost:8000 and log in with the account you created in step 1.3.

## 4. Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Initial Intently app"
git branch -M main
git remote add origin https://github.com/<you>/intently.git
git push -u origin main
```

Then in the GitHub repo: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**. Your app will be live at `https://<you>.github.io/intently/`.

Open that URL on your phone and use "Add to Home Screen" (Safari/Chrome share menu) to install it as an app.

## What's in v1

- Plan tomorrow's activities with a reason attached ("intentions")
- Add/track habits with a running streak count and an XP value. Each habit is one of three kinds:
  - **Once a day** — a checkbox; done or not done today.
  - **Multiple times a day** — a +/− counter for things you might do several times. A streak just needs the count to be above zero that day.
  - **Timed** — log minutes spent (can add more than once a day); a streak just needs the total minutes to be above zero that day.
- XP earned for a habit on a given day = (what you logged that day) × (that habit's XP value) — so a "once" habit awards its XP value flat, a "multi" habit multiplies by the tick count, and a "duration" habit multiplies by minutes logged (default 1 XP/minute). Today's and all-time XP totals show above the habit list.
- A Calendar tab shows a month grid with a colored dot per habit on days it was logged, with a picker for which habits to show.

## Deliberately not in v1 (future ideas)

- Bounties / points for one-off behaviors (separate from habit XP)
- Evening reflection prompt
- Claude-generated daily plans from free-form notes
- XP levels, unlocks, or other heavier gamification
