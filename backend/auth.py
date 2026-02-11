"""
OIDC Authentication Middleware for FastAPI
Validates JWT tokens from SAP IAS (Identity Authentication Service)
"""
import os
import logging
from typing import Optional, Dict, Any
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from jose import jwt, JWTError
from jose.jwk import construct
import requests
from datetime import datetime

logger = logging.getLogger(__name__)


class OIDCConfig:
    """OIDC Configuration from environment variables"""
    def __init__(self):
        self.issuer = os.getenv("OIDC_ISSUER", "https://asojzafbi.accounts.ondemand.com")
        self.client_id = os.getenv("OIDC_CLIENT_ID")
        self.audience = os.getenv("OIDC_AUDIENCE", self.client_id)

        if not self.client_id:
            logger.warning("OIDC_CLIENT_ID not set - authentication will fail")

        # Discover OIDC endpoints
        self.well_known_url = f"{self.issuer}/.well-known/openid-configuration"
        self.jwks_uri = None
        self.jwks_cache = None
        self._discover_endpoints()

    def _discover_endpoints(self):
        """Fetch OIDC discovery document"""
        try:
            response = requests.get(self.well_known_url, timeout=5)
            response.raise_for_status()
            config = response.json()
            self.jwks_uri = config.get("jwks_uri")
            logger.info(f"OIDC discovery successful: {self.issuer}")
        except Exception as e:
            logger.error(f"Failed to fetch OIDC configuration: {e}")
            # Set default JWKS URI based on common SAP IAS pattern
            self.jwks_uri = f"{self.issuer}/oauth2/certs"

    def get_jwks(self) -> Dict[str, Any]:
        """Fetch JSON Web Key Set with caching"""
        if self.jwks_cache:
            return self.jwks_cache

        try:
            response = requests.get(self.jwks_uri, timeout=5)
            response.raise_for_status()
            self.jwks_cache = response.json()
            logger.info(f"JWKS fetched successfully from {self.jwks_uri}")
            return self.jwks_cache
        except Exception as e:
            logger.error(f"Failed to fetch JWKS: {e}")
            return {"keys": []}


class OIDCMiddleware:
    """
    OIDC Middleware for FastAPI
    Validates JWT tokens and injects user info into request state
    """

    # Public paths that don't require authentication
    PUBLIC_PATHS = [
        "/health",
        "/health/ready",
        "/health/live",
        "/metrics",
        "/docs",
        "/openapi.json",
        "/redoc",
    ]

    def __init__(self, app, config: Optional[OIDCConfig] = None):
        self.app = app
        self.config = config or OIDCConfig()

    async def __call__(self, request: Request, call_next):
        """Process request and validate JWT if required"""
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)

        # Skip authentication for public paths
        if any(request.url.path.startswith(path) for path in self.PUBLIC_PATHS):
            return await call_next(request)

        # Skip authentication if OIDC not configured (dev mode)
        if not self.config.client_id:
            # In production, OIDC must be configured - fail fast
            if os.getenv("ENVIRONMENT") == "production":
                logger.error("OIDC not configured in production environment")
                return JSONResponse(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    content={"detail": "Authentication service not configured"},
                )
            logger.warning("OIDC not configured - bypassing authentication (dev mode)")
            request.state.user = {"sub": "dev-user", "email": "dev@example.com"}
            return await call_next(request)

        # Extract token from Authorization header
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Missing Authorization header"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Invalid Authorization header format"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = auth_header.split(" ", 1)[1]

        # Validate token
        try:
            user_info = self._validate_token(token)
            request.state.user = user_info
            logger.debug(f"Authenticated user: {user_info.get('email', user_info.get('sub'))}")
        except HTTPException as e:
            return JSONResponse(
                status_code=e.status_code,
                content={"detail": e.detail},
                headers={"WWW-Authenticate": "Bearer"},
            )
        except Exception as e:
            logger.error(f"Token validation failed: {e}")
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": f"Token validation failed: {str(e)}"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        return await call_next(request)

    def _validate_token(self, token: str) -> Dict[str, Any]:
        """
        Validate JWT token
        Returns decoded token claims if valid
        Raises HTTPException if invalid
        """
        try:
            # Get unverified header to find key ID
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")

            # Log token claims for debugging (without sensitive data)
            try:
                unverified_claims = jwt.get_unverified_claims(token)
                logger.info(f"Token claims: iss={unverified_claims.get('iss')}, aud={unverified_claims.get('aud')}, azp={unverified_claims.get('azp')}, exp={unverified_claims.get('exp')}")
                logger.info(f"Expected: issuer={self.config.issuer}, client_id={self.config.client_id}, audience={self.config.audience}")
            except Exception:
                pass

            if not kid:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token missing key ID (kid)"
                )

            # Get JWKS and find matching key
            jwks = self.config.get_jwks()
            key = None

            for jwk_key in jwks.get("keys", []):
                if jwk_key.get("kid") == kid:
                    key = construct(jwk_key)
                    break

            if not key:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Public key not found for kid: {kid}"
                )

            # Decode and validate token signature/time-based claims
            decode_options = {
                "verify_signature": True,
                "verify_exp": True,
                "verify_nbf": True,
                "verify_iat": True,
                "verify_aud": False,  # manual audience validation below
                "verify_iss": False,  # manual issuer validation below
            }

            decoded = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                options=decode_options,
            )

            current_time = datetime.utcnow().timestamp()

            # Check expiration
            exp = decoded.get("exp")
            if exp and current_time > exp:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token has expired"
                )

            # Check not before
            nbf = decoded.get("nbf")
            if nbf and current_time < nbf:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token not yet valid"
                )

            # Issuer validation
            issuer = decoded.get("iss")
            if issuer and issuer != self.config.issuer:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token issuer"
                )

            # Audience / azp validation (SAP IAS uses azp for client_id)
            allowed_audiences = [a for a in {self.config.audience, self.config.client_id} if a]
            aud_claim = decoded.get("aud")
            azp_claim = decoded.get("azp")

            audience_ok = False
            if allowed_audiences:
                if isinstance(aud_claim, list):
                    audience_ok = any(aud in aud_claim for aud in allowed_audiences)
                elif isinstance(aud_claim, str):
                    audience_ok = aud_claim in allowed_audiences

                # Fallback: SAP IAS often places client_id in azp
                if not audience_ok and azp_claim:
                    audience_ok = azp_claim in allowed_audiences

                if not audience_ok:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid token audience"
                    )

            return decoded

        except JWTError as e:
            logger.error(f"JWT validation error: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token: {str(e)}"
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Unexpected error during token validation: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Internal server error during authentication"
            )


def get_current_user(request: Request) -> Dict[str, Any]:
    """
    Dependency to get current authenticated user from request state
    Usage: user = Depends(get_current_user)
    """
    if not hasattr(request.state, "user"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    return request.state.user
