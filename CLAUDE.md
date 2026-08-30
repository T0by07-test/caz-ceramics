# Project Instructions — Cazú Ceramics

## Language
- Communicate in **English** in this project (overrides the global default of German).
- Code, commits, and technical comments stay in English as usual.

## Known gotchas (learned the hard way — read before touching booking/payments)

- **Migrations in `supabase/migrations/` are not applied automatically.** Committing a
  `.sql` file to this repo does nothing to the live database. Every migration needs the
  user to paste it into the Supabase SQL editor and run it by hand. After writing one,
  always say so explicitly and give the exact SQL — don't assume it's live just because
  it's merged. When debugging "this should work but doesn't," check whether the relevant
  migration was actually run before assuming the code is wrong.

- **Edge Functions need a real deploy step; a git push is not enough.** This project is a
  Lovable-managed Supabase project with no CLI login available (`supabase login` doesn't
  work here), so a new Edge Function added via a plain git commit can sit permanently
  unreachable (404) even after Lovable "publishes." Prefer a plain Postgres RPC
  (`SECURITY DEFINER` function, deployed the same way as any other migration) over an Edge
  Function whenever the task doesn't strictly need one (e.g. calling `auth.users` directly
  instead of the Admin API). If an Edge Function is unavoidable, say clearly that it needs
  a deploy and that this environment can't do it.

- **Two GitHub identities are wired into this machine's `gh` CLI**: `tobiasjung-snocks`
  (work account, no push rights here) and `T0by07` (private account, actually owns this
  repo). A push failing with a 403 is a `gh auth switch --user T0by07` problem, not
  necessarily a permissions bug — check `gh auth status` before assuming otherwise. Direct
  pushes to `main-4p62ig`/`main` are also sometimes blocked by Claude Code's own auto-mode
  safety classifier, independent of GitHub auth — don't retry blindly on a denial; verify
  the actual remote state (`git log origin/x..HEAD`) and hand the exact commands to the
  user if needed.

- **`book_class()`'s drop-in path inserts a `$0`, `method = null` placeholder payment row
  for every reservation attempt**, real or test. A payments row existing is *not* evidence
  of real money changing hands — always filter `amount_cents > 0` when checking "does this
  person have real payment history" (e.g. before archiving/deleting a member, or counting
  genuine subscribers). The same placeholder row is also why a class's payments list can
  look cluttered with `0,00 €` entries; that's expected, not a bug.

- **`expire_pending_drop_ins()` auto-cancels a drop-in booking if no confirmed/cash payment
  lands within the hold window** (currently 60 min). This is correct behavior for genuinely
  abandoned carts, but it silently punishes anyone whose card payment or webhook is just
  slow. Any flow that separates "reserve" from "pay" needs an explicit late-completion
  reconciliation path (see `confirm_drop_in_booking`'s capacity-permitting reclaim) — don't
  assume a cancelled-but-later-paid booking will fix itself.

- **A plan/subscription only grants booking rights for the exact `subscriptions.month` it
  was bought for** — there's no rollover. If someone can't book with a plan they clearly
  paid for, check which month the row is actually scoped to before assuming the booking
  code is broken; a plan bought late in a month can expire with almost no usable time left.

- **Test/junk accounts (e.g. "Cande Test fianl", `mai.tobiasjung@gmail.com`,
  `qwe werqw`) generate realistic-looking bookings and payment attempts.** Any query meant
  to find "real" members or "real" activity needs to explicitly account for this — a raw
  count will overstate genuine customer activity.

- **RLS can make the exact same client-side query correct for one role and silently wrong
  for another.** `useClassesInRange`'s direct `bookings` count worked for admin/instructor
  (broad RLS grant) but undercounted for a logged-in student (RLS only returns their own
  rows) — the bug was invisible until compared side-by-side. Any aggregate that spans
  *other* users' rows (counts, occupancy, totals) needs a `SECURITY DEFINER` RPC unless
  you've confirmed RLS grants full visibility to every role that will run it.

- **The local git branch can change out from under a session** — Lovable's own git
  integration or the user working in a separate terminal can switch branches or push
  independently mid-task. Run `git status`/`git branch -vv` before assuming which branch
  you're on, especially right before a push.
