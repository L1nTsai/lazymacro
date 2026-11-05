# LazyMacro

An in-house, mobile-first web app for logging meals by voice and seeing what's left for the day. It installs to the home screen and only works online.

This branch contains Phase 1, the foundation: sign-in, goals, the USDA food database and the app shell. Voice logging, Fridge and Ideas come next.

## Run it

```sh
pnpm install
cp .env.example .env.local   # then add the Supabase URL and publishable key
pnpm dev
```

There's no local database. The app and the Supabase CLI both use the live project, so run `supabase link --project-ref <ref>` once.

## Before the team can sign up

1. **Allow your email domain.** Sign-up is refused for everyone until a domain is added:

   ```sql
   insert into app_private.allowed_email_domains (domain) values ('yourcompany.com');
   ```

2. **Connect an SMTP provider** in Supabase under Authentication > Emails. Without one, Supabase only emails members of the Supabase organization, at about two emails an hour.
3. **Turn on the custom email templates.** They need SMTP. Add these to `[auth.email]` in `supabase/config.toml` for each of `confirmation`, `recovery` and `email_change`, then run `supabase config push`:

   ```toml
   [auth.email.template.confirmation]
   subject = "Confirm your LazyMacro email"
   content_path = "./supabase/templates/confirmation.html"
   ```

   These templates send people to a page where they tap Continue, so company mail scanners opening a link can't use it up.
4. **When you deploy,** set `site_url` and `additional_redirect_urls` in `supabase/config.toml` to the real address, then push.

`supabase config push` can't be previewed safely: it applies changes even when you answer no to its prompt.

## Food data

Foods come from USDA FoodData Central (public domain): Foundation Foods and SR Legacy. Foods missing calories or a macro are skipped rather than estimated. Re-running the import is safe.

```sh
pnpm import:usda <foundation-food.json> <sr-legacy-csv-dir>
```

Download both from https://fdc.nal.usda.gov/download-datasets/. Use the JSON release of Foundation Foods, because its CSV release leaves out the food and nutrient files.

## Tests

| Command | What it checks | Touches the live project? |
| --- | --- | --- |
| `pnpm test` | Target calculations, USDA parsing, validation | No |
| `pnpm test:db` | Row-level security, sign-up domains, account deletion | Yes, but everything is rolled back |
| `pnpm build && pnpm test:e2e` | The full app in iPhone and Android browser engines | Yes. Creates temporary accounts on a test domain, then removes them. Sends no email |

## Design rules

- Vercel's black, white and gray, using the Geist font, in light and dark mode.
- No shadows or glow. Borders separate surfaces.
- Color is only for things that fill in: graphs, bars and status.
- Going over a target stays neutral gray. Red is only for real errors.

## Nutrition rules

Macros come from the database. An AI estimate is the last resort, used only when no database source has the food. See the product plan for the full order of sources.

## Security notes

- Personal data is protected by row-level security in the database, not only by app code.
- The domain rule is a database trigger, so calling Supabase directly can't get around it.
- Sign-ins go through the app's server, so Supabase's per-IP limit (30 per 5 minutes) is shared by everyone using the app. That caps password guessing, but an attacker could briefly lock people out.
