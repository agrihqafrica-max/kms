"""AUTH-01 JWT verification matrix (unit level, no database)."""
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

import auth
from auth01_utils import make_token


def expect_401(token):
    with pytest.raises(HTTPException) as excinfo:
        auth.verify_access_token(token)
    assert excinfo.value.status_code == 401
    assert excinfo.value.headers.get("WWW-Authenticate") == "Bearer"


def test_valid_token_returns_identity():
    sub = uuid.uuid4()
    identity = auth.verify_access_token(make_token(sub))
    assert identity.user_id == sub
    assert identity.claims["role"] == "authenticated"


def test_expired_token_rejected():
    expect_401(make_token(uuid.uuid4(), expires_in=-3600))


def test_bad_signature_rejected():
    expect_401(make_token(uuid.uuid4(), secret="wrong-secret-0123456789abcdef0123456789"))


def test_wrong_issuer_rejected():
    expect_401(make_token(uuid.uuid4(), issuer="https://evil.example.com/auth/v1"))


def test_wrong_audience_rejected():
    expect_401(make_token(uuid.uuid4(), audience="anon"))


def test_missing_expiry_rejected():
    expect_401(make_token(uuid.uuid4(), omit=("exp",)))


def test_missing_subject_rejected():
    expect_401(make_token(uuid.uuid4(), omit=("sub",)))


def test_non_uuid_subject_rejected():
    expect_401(make_token("not-a-uuid"))


def test_malformed_token_rejected():
    expect_401("this-is-not-a-jwt")


def test_alg_none_rejected():
    expect_401(make_token(uuid.uuid4(), algorithm="none", secret=None))


def test_service_role_token_rejected():
    expect_401(make_token(uuid.uuid4(), role="service_role"))


def test_hs256_rejected_when_no_secret_configured(monkeypatch):
    token = make_token(uuid.uuid4())
    monkeypatch.setattr(auth, "_settings", {
        "issuer": auth.get_settings()["issuer"],
        "jwks_url": auth.get_settings()["jwks_url"],
        "hs256_secret": None,
    })
    expect_401(token)


class _StubSigningKey:
    def __init__(self, key):
        self.key = key


class _StubJWKS:
    def __init__(self, public_key):
        self.public_key = public_key

    def get_signing_key_from_jwt(self, token):
        return _StubSigningKey(self.public_key)


def test_es256_token_verified_via_jwks(monkeypatch):
    private_key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(auth, "_jwks_client", _StubJWKS(private_key.public_key()))
    sub = uuid.uuid4()
    token = make_token(sub, algorithm="ES256", secret=private_key)
    identity = auth.verify_access_token(token)
    assert identity.user_id == sub


def test_es256_tampered_signature_rejected(monkeypatch):
    private_key = ec.generate_private_key(ec.SECP256R1())
    other_key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(auth, "_jwks_client", _StubJWKS(other_key.public_key()))
    expect_401(make_token(uuid.uuid4(), algorithm="ES256", secret=private_key))


def test_unknown_signing_key_rejected(monkeypatch):
    class _RefusingJWKS:
        def get_signing_key_from_jwt(self, token):
            raise jwt.PyJWKClientError("unknown kid")

    monkeypatch.setattr(auth, "_jwks_client", _RefusingJWKS())
    expect_401(make_token(uuid.uuid4(), algorithm="ES256",
                          secret=ec.generate_private_key(ec.SECP256R1())))