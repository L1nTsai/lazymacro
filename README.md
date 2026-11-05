# LazyMacro

An in-house, mobile-first web app for logging meals by voice and seeing what's left for the day. It installs to the home screen and only works online.

So far it has sign-in, goals, the USDA food database, and logging meals by voice or text with a review step, history, favorites and saved defaults. Fridge and Ideas come next.

## Run it

```sh
pnpm install
cp .env.example .env.local   # then fill in the Supabase and AI values
pnpm dev
```

There's no local database. The app and the Supabase CLI both use the live project, so run `supabase link --project-ref <ref>` once.

Logging needs `ANTHROPIC_API_KEY`. `USDA_API_KEY` is optional and adds branded foods. Without an Anthropic key, searching foods and entering label values still work.

Voice uses the browser's built-in speech recognition, which is free but varies by device: iPhones need Siri turned on, Firefox doesn't support it by default, and the browser sends audio to Apple or Google. To switch to Gemini, add a **paid-tier** `GEMINI_API_KEY`, because Google uses free-tier data to improve its products. Nothing else needs changing.

The microphone only works over https or on localhost, so testing on a phone over Wi-Fi needs a deployed or tunneled address.

## Approving people

Anyone with a Gmail address can create an account, but it does nothing until you approve it. There are no emails, so addresses aren't verified: only approve people you've checked with.

- **Approve:** in the Supabase dashboard, open Table Editor, then `signup_approvals`, and tick `approved`.
- **Forgotten password:** in the SQL Editor, set a temporary one. They can change it under Me, then Account.

  ```sql
  update auth.users set encrypted_password = extensions.crypt('a-temporary-password', extensions.gen_salt('bf'))
  where email = 'person@gmail.com';
  ```

## Daily limit

Each person gets 10 logged meals a day from the AI, counted in their time zone, and 10 voice recordings. Searching foods and entering label values don't count. To change it, set `daily_limit` in `use_ai_call` with a new migration. Set a spending limit on the Anthropic key in its console too.

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
| `pnpm build && pnpm test:e2e` | The full app in iPhone and Android browser engines | Yes. Creates temporary accounts and foods, then removes them. Sends no email. Claude and Gemini are replaced by a local stand-in, so it costs nothing and doesn't test real AI quality |
| `pnpm eval:check` | Every answer in the evaluation set exists in the food table | Reads only |
| `pnpm eval` | Real parsing and matching accuracy, against the 85% target | Reads only, but calls Claude and costs a few cents |

## Design rules

- Vercel's black, white and gray, using the Geist font, in light and dark mode.
- No shadows or glow. Borders separate surfaces.
- Color is only for things that fill in: graphs, bars and status.
- Screens never scroll. Content that doesn't fit moves to another page.
- It should feel like an iOS app: short steps, with a slide when moving between pages.
- Body measurements are entered in imperial units and stored as metric. Food stays in grams.
- Going over a target stays neutral gray. Red is only for real errors.

## Nutrition rules

Macros come from the database. Each food goes through these sources in order: personal aliases and last choices, team-saved foods, USDA, USDA branded, the chain's official page, built from database ingredients, then an AI estimate as the last resort. Restaurant items try the chain's page right after saved foods. The parser never produces macros, and the database computes them again when a meal is confirmed.

## Security notes

- Addresses aren't verified, so someone could sign up with an address they don't own. Approval is the check.
- Personal data is protected by row-level security in the database, not only by app code.
- The Gmail rule and approvals are enforced in the database, so calling Supabase directly can't get around them.
- Any signed-in person can add a custom or restaurant food through `save_food`. Its rules stop a custom food being marked verified, but a teammate could still enter wrong numbers, which suits an in-house app.
- Sign-ins go through the app's server, so Supabase's per-IP limit (30 per 5 minutes) is shared by everyone using the app. That caps password guessing, but an attacker could briefly lock people out.
