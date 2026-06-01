"""
Google Cloud Function for auto-archiving old release files to Archive storage

Trigger: Cloud Pub/Sub triggered by Cloud Scheduler (daily) OR GCS object finalize events

This function:
1. Lists all versioned release folders in quantcopier-releases bucket
2. Sorts versions in ascending order so the latest version is easy to keep
3. Keeps the newest version folder at the bucket root
4. Moves every older version folder under archive/<version>/
5. Leaves releases.json untouched at the bucket root
6. Logs all actions for audit trail

Deploy with:
gcloud functions deploy archive-old-releases \
  --runtime python311 \
  --trigger-topic archive-old-releases \
  --entry-point archive_releases \
  --service-account <YOUR_SERVICE_ACCOUNT>

Or setup Cloud Scheduler to trigger daily:
gcloud scheduler jobs create pubsub archive-old-releases \
  --schedule="0 2 * * *" \
  --topic archive-old-releases
"""

import functions_framework
from google.cloud import storage
from typing import Dict, List, Tuple
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Bucket name
BUCKET_NAME = "quantcopier-releases"

MANIFEST_NAME = "releases.json"
ARCHIVE_PREFIX = "archive"


def parse_version(version_str: str) -> Tuple[int, int, int]:
    """
    Parse version string to tuple for comparison
    
    Args:
        version_str: Version string (e.g., "1.3.2" or "v1.3.2")
    
    Returns:
        Tuple of (major, minor, patch)
    """
    version_str = version_str.lstrip('v')
    try:
        parts = version_str.split('.')
        return tuple(int(p) for p in parts[:3])
    except (ValueError, IndexError):
        return (0, 0, 0)


def extract_version_folder(blob_name: str) -> Tuple[str, str]:
    """
    Extract the version folder and file name from a release object path.
    
    Expected format: v1.3.2/QuantCopier.exe
    
    Returns:
        Tuple of (version_str, blob_name) or (None, blob_name) if not matched
    """
    parts = blob_name.split('/')
    
    if len(parts) < 2:
        return None, blob_name
    
    version_str = parts[0]
    if not version_str.startswith('v'):
        return None, blob_name

    return version_str, blob_name


def get_version_groups() -> List[Dict]:
    """
    Group all release files by version folder.
    
    Returns:
        List of version folders with associated blob metadata
    """
    try:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        groups: Dict[str, List[Dict]] = {}
        
        # List all blobs
        blobs = client.list_blobs(BUCKET_NAME)
        
        for blob in blobs:
            if blob.name == MANIFEST_NAME or blob.name.startswith(f"{ARCHIVE_PREFIX}/"):
                continue

            version_str, blob_name = extract_version_folder(blob.name)

            if version_str:
                version_tuple = parse_version(version_str)
                groups.setdefault(version_str, []).append({
                    'version_str': version_str,
                    'version_tuple': version_tuple,
                    'blob_name': blob_name,
                    'storage_class': blob.storage_class,
                    'size': blob.size,
                    'updated': blob.updated,
                })

        version_groups = []
        for version_str, items in groups.items():
            version_groups.append({
                'version_str': version_str,
                'version_tuple': items[0]['version_tuple'] if items else (0, 0, 0),
                'items': items,
            })

        version_groups.sort(key=lambda x: x['version_tuple'])
        return version_groups
    
    except Exception as e:
        logger.error(f"Error getting file groups: {e}")
        return []


def move_to_archive(blob_name: str, version_str: str) -> bool:
    """
    Move a blob to the archive prefix while preserving the file name.
    
    Args:
        blob_name: Name of blob to move
        version_str: Version folder such as v1.3.2
    
    Returns:
        True if successful, False otherwise
    """
    try:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)

        source_blob = bucket.blob(blob_name)
        file_name = blob_name.split('/')[-1]
        destination_name = f"{ARCHIVE_PREFIX}/{version_str}/{file_name}"
        destination_blob = bucket.blob(destination_name)

        bucket.copy_blob(source_blob, bucket, new_name=destination_name)
        source_blob.delete()

        logger.info(f"Moved {blob_name} to {destination_name}")
        return True
    
    except Exception as e:
        logger.error(f"Error moving blob to archive: {e}")
        return False


def archive_old_releases(request):
    """
    Main Cloud Function entry point
    
    Triggered by Cloud Scheduler or GCS events
    """
    logger.info(f"Starting archive-old-releases at {datetime.utcnow()}")
    
    try:
        # Get grouped files by version folder
        groups = get_version_groups()
        
        stats = {
            'processed': 0,
            'archived': 0,
            'kept_in_standard': 0,
            'errors': 0
        }
        
        if not groups:
            logger.info("No versioned release folders found")
            return {
                'status': 'success',
                'timestamp': datetime.utcnow().isoformat(),
                'stats': stats,
            }

        latest_version = groups[-1]['version_str']
        logger.info(f"Keeping latest version folder in root: {latest_version}")

        for group in groups:
            version_str = group['version_str']
            items = group['items']

            logger.info(f"Processing {version_str} with {len(items)} objects")

            for item in items:
                stats['processed'] += 1

                if version_str == latest_version:
                    logger.info(f"  Keeping {item['blob_name']} in root")
                    stats['kept_in_standard'] += 1
                    continue

                if item['blob_name'].startswith(f"{ARCHIVE_PREFIX}/"):
                    logger.info(f"  Already archived: {item['blob_name']}")
                    stats['archived'] += 1
                    continue

                logger.info(f"  Archiving {item['blob_name']} -> {ARCHIVE_PREFIX}/{version_str}/")
                if move_to_archive(item['blob_name'], version_str):
                    stats['archived'] += 1
                else:
                    stats['errors'] += 1
        
        # Log summary
        logger.info(f"Archive job completed at {datetime.utcnow()}")
        logger.info(f"Stats: {stats}")
        
        return {
            'status': 'success',
            'timestamp': datetime.utcnow().isoformat(),
            'stats': stats
        }
    
    except Exception as e:
        logger.error(f"Error in archive_old_releases: {e}")
        stats['errors'] += 1
        return {
            'status': 'error',
            'message': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }


@functions_framework.http
def archive_releases(request):
    """HTTP wrapper for archive_releases function"""
    return archive_old_releases(request)
