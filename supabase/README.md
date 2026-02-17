## Supabase folder layout

This project uses Supabase migrations.

### `supabase/migrations/`
- **Only real schema migrations** live here.
- These files are what `supabase db push` / `supabase migration list` work with.

### `supabase/scripts/`
- **Manual SQL scripts** (verification queries, admin utilities, one-off troubleshooting).
- These are **not** run automatically by the Supabase CLI.

### `supabase/dev/`
- **Generated / consolidated** SQL exports used for debugging or restoring a DB manually.
- Not used by the Supabase CLI migration system.

