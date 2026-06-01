"""
GCP Cloud Storage utilities for version checking and file management.
Handles checking for latest versions in GCS bucket and downloading updates.
"""

import os
import json
import requests
from typing import Optional, Dict, Any
from google.cloud import storage
from google.oauth2 import service_account
from pathlib import Path


class GCPBucketManager:
    """Manages interactions with GCP Cloud Storage bucket for releases"""

    @staticmethod
    def _create_storage_client() -> storage.Client:
        """Create a storage client from FIREBASE_SERVICE_ACCOUNT_KEY only."""
        service_account_key = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
        if not service_account_key:
            raise ValueError("FIREBASE_SERVICE_ACCOUNT_KEY environment variable not set")

        cred_dict = json.loads(service_account_key)
        credentials = service_account.Credentials.from_service_account_info(cred_dict)
        return storage.Client(credentials=credentials)
    
    def __init__(self, bucket_name: str = "quantcopier-releases"):
        """
        Initialize GCP Bucket Manager
        
        Args:
            bucket_name: Name of the GCS bucket containing releases
        """
        self.bucket_name = bucket_name
        try:
            self.client = self._create_storage_client()
            self.bucket = self.client.bucket(bucket_name)
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


def compare_versions(v1: str, v2: str) -> int:
    """
    Compare two version strings
    
    Args:
        v1: First version string (e.g., "1.3.2")
        v2: Second version string (e.g., "1.4.0")
    
    Returns:
        -1 if v1 < v2, 0 if equal, 1 if v1 > v2
    """
    try:
        v1_parts = tuple(map(int, v1.split('.')))
        v2_parts = tuple(map(int, v2.split('.')))
        
        if v1_parts < v2_parts:
            return -1
        elif v1_parts > v2_parts:
            return 1
        else:
            return 0
    except Exception:
        return 0


# Initialize GCP Bucket Manager
gcp_bucket_manager = GCPBucketManager()
