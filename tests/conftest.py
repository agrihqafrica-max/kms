import os

# Test-only auth configuration. HS256 verification is enabled solely because
# this secret is set; production uses the project JWKS (ES256) and never sets it.
os.environ["SUPABASE_URL"] = "https://auth01-test.supabase.co"
os.environ["SUPABASE_JWT_SECRET"] = "auth01-test-secret-0123456789abcdef0123456789"