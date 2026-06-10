"""Azure AI Video Indexer API client.

Supports two auth modes, auto-detected from env vars:
  - Trial (videoindexer.ai): set AZURE_VI_API_KEY
  - ARM / production:        set AZURE_VI_TENANT_ID + CLIENT_ID + CLIENT_SECRET
"""

import logging
import os
import time

import requests

logger = logging.getLogger(__name__)

_VI_BASE = "https://api.videoindexer.ai"
_ARM_TOKEN_URL = "https://login.microsoftonline.com/{tenant_id}/oauth2/token"
_ARM_BASE = "https://management.azure.com"


class AzureVIClient:
    def __init__(self):
        self.account_id = _require_env("AZURE_VI_ACCOUNT_ID")
        self.location = os.environ.get("AZURE_VI_LOCATION", "trial")

        # Trial mode uses a subscription key from api-portal.videoindexer.ai
        self.api_key = os.environ.get("AZURE_VI_API_KEY")

        # ARM mode credentials (production)
        self.subscription_id = os.environ.get("AZURE_VI_SUBSCRIPTION_ID")
        self.resource_group = os.environ.get("AZURE_VI_RESOURCE_GROUP")
        self.tenant_id = os.environ.get("AZURE_VI_TENANT_ID")
        self.client_id = os.environ.get("AZURE_VI_CLIENT_ID")
        self.client_secret = os.environ.get("AZURE_VI_CLIENT_SECRET")

        self._vi_token: str | None = None
        self._vi_token_expiry: float = 0

        mode = "trial/API-key" if self.api_key else "ARM"
        logger.info(f"AzureVIClient initialised in {mode} mode (location={self.location})")

    # ------------------------------------------------------------------
    # Auth — trial mode
    # ------------------------------------------------------------------

    def _get_trial_token(self) -> str:
        """Exchange the API subscription key for a short-lived access token."""
        resp = requests.get(
            f"{_VI_BASE}/auth/{self.location}/Accounts/{self.account_id}/AccessToken",
            headers={"Ocp-Apim-Subscription-Key": self.api_key},
            params={"allowEdit": "true"},
            timeout=20,
        )
        resp.raise_for_status()
        # Response is a quoted JSON string, e.g. "\"eyJ...\""
        token = resp.json()
        return token

    # ------------------------------------------------------------------
    # Auth — ARM / production mode
    # ------------------------------------------------------------------

    def _get_arm_token(self) -> str:
        resp = requests.post(
            _ARM_TOKEN_URL.format(tenant_id=self.tenant_id),
            data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "resource": "https://management.azure.com/",
            },
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()["access_token"]

    def _get_arm_vi_token(self) -> str:
        arm_token = self._get_arm_token()
        url = (
            f"{_ARM_BASE}/subscriptions/{self.subscription_id}"
            f"/resourceGroups/{self.resource_group}"
            f"/providers/Microsoft.VideoIndexer/accounts/{self.account_id}"
            f"/generateAccessToken?api-version=2024-01-01"
        )
        resp = requests.post(
            url,
            headers={"Authorization": f"Bearer {arm_token}"},
            json={"permissionType": "Contributor", "scope": "Account"},
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()["accessToken"]

    # ------------------------------------------------------------------
    # Unified token getter (cached)
    # ------------------------------------------------------------------

    def _get_vi_token(self) -> str:
        if self._vi_token and time.time() < self._vi_token_expiry:
            return self._vi_token

        if self.api_key:
            self._vi_token = self._get_trial_token()
            self._vi_token_expiry = time.time() + 3500
        else:
            self._vi_token = self._get_arm_vi_token()
            self._vi_token_expiry = time.time() + 3500

        return self._vi_token

    def _auth_headers(self) -> dict:
        return {"Authorization": f"Bearer {self._get_vi_token()}"}

    # ------------------------------------------------------------------
    # API calls
    # ------------------------------------------------------------------

    def submit_url(self, video_url: str, name: str, language: str = "auto") -> str:
        """Submit a video URL for indexing. Returns the Azure VI videoId."""
        resp = requests.post(
            f"{_VI_BASE}/{self.location}/Accounts/{self.account_id}/Videos",
            headers=self._auth_headers(),
            params={
                "videoUrl": video_url,
                "name": name[:80],
                "language": language,
                "indexingPreset": "Default",
                "streamingPreset": "NoStreaming",
                "privacy": "Private",
            },
            timeout=30,
        )
        resp.raise_for_status()
        video_id = resp.json()["id"]
        logger.info(f"Azure VI accepted '{name}' → videoId={video_id}")
        return video_id

    def get_index(self, video_id: str) -> dict:
        """Fetch the full video index JSON (contains state + insights)."""
        resp = requests.get(
            f"{_VI_BASE}/{self.location}/Accounts/{self.account_id}/Videos/{video_id}/Index",
            headers=self._auth_headers(),
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def get_status(self, video_id: str) -> str:
        """Returns processing state: 'Uploaded', 'Processing', 'Processed', 'Failed'."""
        return self.get_index(video_id).get("state", "Unknown")

    def delete_video(self, video_id: str) -> None:
        """Delete a video from Azure VI (call after export to save quota)."""
        resp = requests.delete(
            f"{_VI_BASE}/{self.location}/Accounts/{self.account_id}/Videos/{video_id}",
            headers=self._auth_headers(),
            timeout=20,
        )
        resp.raise_for_status()
        logger.info(f"Deleted Azure VI video {video_id}")

    def check_health(self) -> dict:
        """Verify credentials work. Returns {"ok": bool, "detail": str}."""
        try:
            token = self._get_vi_token()
            return {"ok": bool(token), "detail": f"Azure VI credentials valid ({self.location} mode)"}
        except Exception as e:
            return {"ok": False, "detail": str(e)}


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------

_client: AzureVIClient | None = None


def get_client() -> AzureVIClient:
    global _client
    if _client is None:
        _client = AzureVIClient()
    return _client


def _require_env(key: str) -> str:
    val = os.environ.get(key)
    if not val:
        raise RuntimeError(
            f"Required environment variable {key} is not set. "
            f"See .env.example for setup instructions."
        )
    return val
