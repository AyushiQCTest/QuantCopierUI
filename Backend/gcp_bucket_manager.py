"""
GCP Cloud Storage utilities for version checking and file management.
Handles checking for latest versions in GCS bucket and downloading updates.
"""

import os
import sys
import json
import requests
from typing import Optional, Dict, Any
from google.cloud import storage
from google.oauth2 import service_account
from pathlib import Path


RELEASES_MANIFEST_BLOB = "Telegram/releases.json"


def normalize_storage_bucket(bucket_raw: str) -> str:
    """Normalize FIREBASE_STORAGE_BUCKET to the GCS bucket resource name."""
    return bucket_raw.replace("gs://", "").strip("/")


def release_tag_from_manifest(data: dict) -> str:
    """Return version folder prefix from manifest (e.g. v1.3.3)."""
    latest = str(data.get("latest", "")).strip()
    if latest:
        return latest if latest.startswith("v") else f"v{latest.lstrip('v')}"
    version = str(data.get("version", "")).strip().lstrip("v")
    return f"v{version}" if version else ""


def blob_name_for_component(data: dict, component_key: str) -> Optional[str]:
    """Build GCS object path for a manifest component (e.g. v1.3.3/QuantCopier.exe)."""
    files = data.get("files") if isinstance(data.get("files"), dict) else {}
    filename = files.get(component_key)
    if not filename:
        return None
    tag = release_tag_from_manifest(data)
    if not tag:
        return None
    return f"{tag}/{filename}"


def release_info_from_manifest(
    data: dict,
    component_key: str = "mainInstaller",
) -> Optional[Dict[str, Any]]:
    """Parse releases.json dict into update metadata for one component."""
    latest_version = str(data.get("latest", "")).lstrip("v").strip()
    if not latest_version:
        version = str(data.get("version", "")).strip().lstrip("v")
        latest_version = version
    if not latest_version:
        return None

    files = data.get("files") if isinstance(data.get("files"), dict) else {}
    downloads = data.get("downloads") if isinstance(data.get("downloads"), dict) else {}
    base_url = data.get("url") or data.get("baseUrl", "")

    installer_name = files.get(component_key, "QuantCopier.exe")
    download_url = downloads.get(component_key)
    blob_name = blob_name_for_component(data, component_key)

    if not download_url and base_url:
        download_url = f"{base_url}{installer_name}"

    return {
        "version": latest_version,
        "name": installer_name,
        "download_url": download_url,
        "blob_name": blob_name,
        "updated_at": data.get("updatedAt"),
        "manifest_source": "gcs",
    }


def _api_base_dir() -> Path:
    """Directory containing the API executable or package (PyInstaller-safe)."""
    return Path(getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__))))


def _resolve_credentials_path(path: str) -> Path:
    """Resolve a service-account JSON path relative to the API bundle directory."""
    candidate = Path(path)
    if candidate.is_file():
        return candidate.resolve()

    resolved = _api_base_dir() / path
    if resolved.is_file():
        return resolved.resolve()

    cwd_candidate = Path.cwd() / path
    if cwd_candidate.is_file():
        return cwd_candidate.resolve()

    raise FileNotFoundError(
        f"Service account key file not found: {path} "
        f"(searched: {candidate}, {_api_base_dir() / path}, {cwd_candidate})"
    )


def _load_credentials_source() -> tuple[str, Path | None, dict | None]:
    """
    Load GCP credentials from env.

    Supports:
    - FIREBASE_SERVICE_ACCOUNT_KEY_PATH (file path)
    - FIREBASE_SERVICE_ACCOUNT_KEY (file path ending in .json, or inline JSON)
    """
    key_ref = (
        os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY_PATH")
        or os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
        or ""
    ).strip()
    if not key_ref:
        raise ValueError(
            "FIREBASE_SERVICE_ACCOUNT_KEY_PATH or FIREBASE_SERVICE_ACCOUNT_KEY must be set"
        )

    if key_ref.endswith(".json") or Path(key_ref).suffix.lower() == ".json":
        cred_path = _resolve_credentials_path(key_ref)
        cred_dict = json.loads(cred_path.read_text(encoding="utf-8"))
        return f"file:{cred_path}", cred_path, cred_dict

    try:
        cred_dict = json.loads(key_ref)
        return "env:json", None, cred_dict
    except json.JSONDecodeError:
        cred_path = _resolve_credentials_path(key_ref)
        cred_dict = json.loads(cred_path.read_text(encoding="utf-8"))
        return f"file:{cred_path}", cred_path, cred_dict


class GCPBucketManager:
    """Manages interactions with GCP Cloud Storage bucket for releases"""

    @staticmethod
    def _create_storage_client() -> storage.Client:
        """Create a storage client using explicit service-account credentials."""
        source, cred_path, cred_dict = _load_credentials_source()
        project_id = cred_dict.get("project_id") if cred_dict else None
        print(f"[GCPBucketManager] Loading credentials from {source}")

        if cred_path is not None:
            return storage.Client.from_service_account_json(
                str(cred_path),
                project=project_id,
            )

        credentials = service_account.Credentials.from_service_account_info(
            cred_dict,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        return storage.Client(credentials=credentials, project=project_id)

    def __init__(self, bucket_name: Optional[str] = None):
        """
        Initialize GCP Bucket Manager

        Args:
            bucket_name: Name of the GCS bucket containing releases
        """
        self.bucket_name = bucket_name or normalize_storage_bucket(
            os.getenv("FIREBASE_STORAGE_BUCKET", "quantcopier-releases")
        )
        try:
            self.client = self._create_storage_client()
            self.bucket = self.client.bucket(self.bucket_name)
            print(f"[GCPBucketManager] Initialized for bucket: {self.bucket_name}")
        except Exception as e:
            print(f"[GCPBucketManager] Failed to initialize GCS client: {e}")
            self.client = None
            self.bucket = None

    def get_latest_version(self, file_pattern: str = "QuantCopier.exe") -> Optional[Dict[str, Any]]:
        """
        Get the latest version of a file from GCS bucket

        Looks for files in versioned subfolders like /v0.1.4/QuantCopier.exe
        Compares version numbers and returns the latest

            Args:
            file_pattern: Pattern to search for (e.g., 'QuantCopier.exe', 'QuantCopierUI.exe')

        Returns:
            Dict with version, file path, size, and download info, or None if not found
        """
        if not self.bucket:
            return None

        try:
            versions = {}

            # List all blobs in bucket
            blobs = self.client.list_blobs(self.bucket_name)

            for blob in blobs:
                # Check if blob matches pattern and is in version folder (e.g., v0.1.4/QuantCopier.exe)
                if file_pattern in blob.name and '/v' in blob.name:
                    parts = blob.name.split('/')
                    if len(parts) >= 2 and parts[0].startswith('v'):
                        version_str = parts[0][1:]  # Remove 'v' prefix
                        try:
                            # Parse version tuple for comparison
                            version_tuple = tuple(map(int, version_str.split('.')))
                            versions[version_tuple] = {
                                'version': version_str,
                                'blob_name': blob.name,
                                'size': blob.size,
                                'updated_time': blob.updated,
                            }
                        except (ValueError, AttributeError):
                            continue

            if not versions:
                return None

            # Get the highest version
            latest_version = max(versions.keys())
            return versions[latest_version]

        except Exception as e:
            print(f"[GCPBucketManager] Error getting latest version: {e}")
            return None

    def get_download_url(self, blob_name: str, expiration_hours: int = 24) -> Optional[str]:
        """
        Generate a signed download URL for a blob

        Args:
            blob_name: Name of the blob to download
            expiration_hours: How long the URL should be valid (default 24 hours)

        Returns:
            Signed URL string or None if generation failed
        """
        if not self.bucket:
            return None

        try:
            blob = self.bucket.blob(blob_name)

            # Generate signed URL valid for specified hours
            from datetime import timedelta
            url = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(hours=expiration_hours),
                method="GET"
            )
            return url
        except Exception as e:
            print(f"[GCPBucketManager] Error generating download URL: {e}")
            return None

    def download_file(self, blob_name: str, destination_path: str) -> bool:
        """
        Download a file from GCS bucket to local path

        Args:
            blob_name: Name of the blob in the bucket
            destination_path: Local file path to save to

        Returns:
            True if successful, False otherwise
        """
        if not self.bucket:
            return False

        try:
            blob = self.bucket.blob(blob_name)
            blob.download_to_filename(destination_path)
            print(f"[GCPBucketManager] Downloaded {blob_name} to {destination_path}")
            return True
        except Exception as e:
            print(f"[GCPBucketManager] Error downloading file: {e}")
            return False

    def check_file_exists(self, blob_name: str) -> bool:
        """Check if a file exists in the bucket"""
        if not self.bucket:
            return False

        try:
            blob = self.bucket.blob(blob_name)
            return blob.exists()
        except Exception as e:
            print(f"[GCPBucketManager] Error checking file existence: {e}")
            return False

    def download_blob_bytes(self, blob_name: str) -> Optional[bytes]:
        """Download a blob's contents via authenticated GCS API."""
        if not self.bucket:
            return None

        try:
            blob = self.bucket.blob(blob_name)
            return blob.download_as_bytes()
        except Exception as e:
            print(f"[GCPBucketManager] Error downloading blob {blob_name}: {e}")
            return None

    def fetch_releases_manifest(self, blob_name: str = RELEASES_MANIFEST_BLOB) -> Optional[dict]:
        """Fetch and parse releases.json from the bucket using service account auth."""
        raw = self.download_blob_bytes(blob_name)
        if raw is None:
            return None

        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as e:
            print(f"[GCPBucketManager] Invalid JSON in {blob_name}: {e}")
            return None


def fetch_releases_manifest_data() -> Optional[dict]:
    """Fetch releases.json, reusing or creating a bucket manager as needed."""
    manager = gcp_bucket_manager if gcp_bucket_manager.bucket else GCPBucketManager()
    if not manager.bucket:
        return None
    print(
        f"[GCPBucketManager] Fetching {RELEASES_MANIFEST_BLOB} "
        f"from bucket: {manager.bucket_name} (authenticated)"
    )
    return manager.fetch_releases_manifest()


def compare_versions(v1: str, v2: str) -> int:
    """
    Compare two version strings

    Args:
        v1: First version string (e.g., "1.3.2" or "v1.3.2")
        v2: Second version string (e.g., "1.4.0" or "v1.4.0")

    Returns:
        -1 if v1 < v2, 0 if equal, 1 if v1 > v2
    """
    try:
        # Strip 'v' prefix if present and remove whitespace
        v1_clean = v1.lstrip('v').strip()
        v2_clean = v2.lstrip('v').strip()

        v1_parts = tuple(map(int, v1_clean.split('.')))
        v2_parts = tuple(map(int, v2_clean.split('.')))

        if v1_parts < v2_parts:
            return -1
        elif v1_parts > v2_parts:
            return 1
        else:
            return 0
    except ValueError as e:
        # More specific error handling - log the issue instead of silently failing
        print(f"[compare_versions] Error comparing '{v1}' and '{v2}': {e}")
        return 0


# Initialize GCP Bucket Manager (lazy-friendly: created after dotenv in QuantCopierAPI)
gcp_bucket_manager = GCPBucketManager()
