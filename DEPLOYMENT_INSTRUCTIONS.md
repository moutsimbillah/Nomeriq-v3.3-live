# Edge Functions Deployment Instructions

## Prerequisites
- Supabase CLI installed (`npm install -g supabase`)
- Logged into Supabase (`supabase login`)
- Linked to your project (`supabase link --project-ref your-project-ref`)

## Deploy Edge Functions

Deploy all three Edge Functions:

```bash
# Deploy sync-market-symbols
supabase functions deploy sync-market-symbols

# Deploy twelve-data-quote
supabase functions deploy twelve-data-quote

# Deploy create-signal-live
supabase functions deploy create-signal-live
```

## Verify Deployment

After deployment, test the functions:

1. Go to Supabase Dashboard → Edge Functions
2. Check that all three functions are listed
3. Test `sync-market-symbols` from the Market Mode page

## Troubleshooting CORS Errors

If you see CORS errors:

1. **Check function is deployed**: Functions must be deployed before they can be called
2. **Check function logs**: `supabase functions logs sync-market-symbols`
3. **Verify CORS headers**: All functions now return proper CORS headers including `Access-Control-Max-Age`

## Local Development

To test Edge Functions locally:

```bash
# Start Supabase locally
supabase start

# Serve functions locally
supabase functions serve sync-market-symbols --no-verify-jwt
```

Note: When running locally, you may need to adjust the Supabase URL in your `.env` file.
