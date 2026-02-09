@echo off
echo ========================================
echo   Deploying to Supabase
echo ========================================
echo.

echo [1/2] Pushing database migrations...
call npx supabase db push --linked

echo.
echo [2/2] Deploying Edge Functions...
call npx supabase functions deploy --no-verify-jwt

echo.
echo ========================================
echo   Deployment Complete!
echo ========================================
pause
