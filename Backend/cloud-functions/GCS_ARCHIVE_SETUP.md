# GCS Bucket Auto-Archive Setup Guide

This guide explains how to set up automatic archival of old release versions from Standard to Archive storage class in Google Cloud Storage (GCS).

## Overview

The goal is to:
1. Keep the latest version of each file (setup.exe, QC-demo.exe, quant-copier-AP.exe) in **Standard storage** ($0.02/GB/month)
2. Automatically move older versions to **Archive storage** ($0.0012/GB/month) to save costs
3. Maintain an audit trail of all versions

## File Structure in Bucket

Files should be stored in versioned subfolders:

```
quantcopier-releases/
├── v1.3.0/
│   ├── setup.exe
│   ├── QC-demo.exe
│   └── quant-copier-AP.exe
├── v1.3.1/
│   ├── setup.exe
│   ├── QC-demo.exe
│   └── quant-copier-AP.exe
└── v1.3.2/
    ├── setup.exe
    ├── QC-demo.exe
    └── quant-copier-AP.exe
```

## Option 1: Using Terraform (Recommended)

### Prerequisites

- Terraform installed (v1.0+)
- Google Cloud SDK installed and authenticated
- GCP project with billing enabled

### Setup Steps

1. **Navigate to terraform directory:**

```bash
cd Backend/cloud-functions/terraform/
```

2. **Create terraform.tfvars:**

```hcl
project_id = "your-gcp-project-id"
region     = "us-central1"
bucket_name = "quantcopier-releases"
```

3. **Initialize Terraform:**

```bash
terraform init
```

4. **Review and apply configuration:**

```bash
terraform plan
terraform apply
```

This will:
- Create/configure the GCS bucket
- Enable versioning
- Set up lifecycle rules
- Create Cloud Function for archive management
- Set up Cloud Scheduler for daily runs
- Configure all necessary IAM permissions

### Verify Setup

```bash
# Check bucket lifecycle rules
gsutil lifecycle get gs://quantcopier-releases

# List lifecycle rules
gcloud storage buckets describe gs://quantcopier-releases --format="yaml(lifecycle)"
```

## Option 2: Manual Setup with gcloud CLI

### Step 1: Create Bucket with Versioning

```bash
# Create bucket
gsutil mb -p your-gcp-project-id -l us-central1 gs://quantcopier-releases

# Enable versioning
gsutil versioning set on gs://quantcopier-releases
```

### Step 2: Set Lifecycle Rules

Create a file `lifecycle.json`:

```json
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "SetStorageClass", "storageClass": "ARCHIVE"},
        "condition": {"age": 30, "isLive": false, "matchesStorageClass": ["STANDARD"]}
      },
      {
        "action": {"type": "Delete"},
        "condition": {"age": 90, "isLive": false, "matchesStorageClass": ["ARCHIVE"]}
      }
    ]
  }
}
```

Apply the lifecycle:

```bash
gsutil lifecycle set lifecycle.json gs://quantcopier-releases
```

### Step 3: Deploy Cloud Function (Optional, for more control)

```bash
gcloud functions deploy archive-old-releases \
  --gen2 \
  --runtime python311 \
  --region us-central1 \
  --trigger-topic archive-old-releases \
  --entry-point archive_releases \
  --source Backend/cloud-functions/archive-old-releases/ \
  --service-account archive-old-releases@your-project.iam.gserviceaccount.com
```

### Step 4: Set Up Cloud Scheduler (Optional)

```bash
# Create service account for scheduler
gcloud iam service-accounts create cloud-scheduler-archive

# Grant permissions to publish to Pub/Sub
gcloud pubsub topics add-iam-policy-binding archive-old-releases \
  --member serviceAccount:cloud-scheduler-archive@your-project.iam.gserviceaccount.com \
  --role roles/pubsub.publisher

# Create scheduler job
gcloud scheduler jobs create pubsub archive-old-releases-daily \
  --schedule="0 2 * * *" \
  --topic archive-old-releases \
  --oidc-service-account-email cloud-scheduler-archive@your-project.iam.gserviceaccount.com
```

## Understanding Lifecycle Rules

### Rule: Archive after 30 days

```json
{
  "action": {"type": "SetStorageClass", "storageClass": "ARCHIVE"},
  "condition": {
    "age": 30,
    "isLive": false,
    "matchesStorageClass": ["STANDARD"]
  }
}
```

- **age**: Number of days since object was created
- **isLive**: `false` means only non-current versions (requires versioning enabled)
- **matchesStorageClass**: Only applies to objects in STANDARD storage

### Rule: Delete after 90 days

```json
{
  "action": {"type": "Delete"},
  "condition": {
    "age": 90,
    "isLive": false,
    "matchesStorageClass": ["ARCHIVE"]
  }
}
```

This optional rule deletes very old archived versions to further save costs.

## Important Notes

### Storage Class Changes

⚠️ **Important:** In GCS, storage class can only be set at object creation time. To move objects between storage classes:

1. **Automatically via Lifecycle Rules** (Recommended)
   - Lifecycle rules automatically transition objects to different storage classes
   - This is what our setup does

2. **Manually via gsutil rewrite**
   ```bash
   gsutil rewrite -s ARCHIVE gs://quantcopier-releases/v1.3.0/setup.exe
   ```

3. **Using gcloud storage**
   ```bash
   gcloud storage objects copy gs://quantcopier-releases/v1.3.0/setup.exe \
     gs://quantcopier-releases/v1.3.0/setup.exe \
     --storage-class=ARCHIVE
   ```

### Versioning Considerations

- **Enabling versioning** is required for the `isLive: false` condition to work
- Versioning creates a new version of each object when updated
- This allows keeping multiple versions with different storage classes
- Cost: Minimal - storage charges apply only to actual data size

### Access Control

Set IAM roles for bucket access:

```bash
# Allow users to download files
gcloud storage buckets add-iam-policy-binding gs://quantcopier-releases \
  --member user:email@example.com \
  --role roles/storage.objectViewer

# Allow CI/CD to upload files
gcloud storage buckets add-iam-policy-binding gs://quantcopier-releases \
  --member serviceAccount:ci-cd@project.iam.gserviceaccount.com \
  --role roles/storage.objectAdmin
```

## Monitoring and Troubleshooting

### Check Current Lifecycle Rules

```bash
gsutil lifecycle get gs://quantcopier-releases
```

### Monitor Storage Costs

```bash
# View bucket size and storage class distribution
gsutil du -s -m gs://quantcopier-releases

# List all objects with storage classes
gsutil ls -L -h -r gs://quantcopier-releases/**
```

### Verify Archival Process

```bash
# List objects and their storage classes
gsutil ls -L gs://quantcopier-releases/v1.3.0/

# Check object metadata
gsutil stat gs://quantcopier-releases/v1.3.0/setup.exe
```

### Common Issues

**Issue: Lifecycle rules not applying**
- Solution: Verify versioning is enabled: `gsutil versioning get gs://quantcopier-releases`
- Ensure objects are actually non-current versions

**Issue: Can't change storage class manually**
- Solution: Use lifecycle rules or `gsutil rewrite` command
- Direct storage class changes are not supported

**Issue: High costs despite archival**
- Check that lifecycle rules are configured correctly
- Verify age conditions match your expectations
- Consider shortening the age threshold (e.g., 7 days instead of 30)

## Cost Optimization

### Estimated Savings

With automatic archival after 30 days:

```
Standard Storage: $0.020/GB/month
Archive Storage:  $0.0012/GB/month

Savings: ~94% per archived GB per month
```

Example: For 100 GB of releases

```
30 days in Standard:  30 days × 100 GB × $0.020 = $60
330 days in Archive:  330 days × 100 GB × $0.0012 = $132
vs. 365 days in Standard: 365 days × 100 GB × $0.020 = $730

Annual Savings: ~$538
```

### Additional Cost Savings

- **Early Deletion Penalty**: Archive has 90-day minimum. Deleting before 90 days incurs charges
- **Egress Charges**: Retrieving from Archive is more expensive ($0.02/GB) than Standard ($0.01/GB)
- **Operation Costs**: API calls for lifecycle transitions are minimal

## Security Considerations

1. **Versioning**: Keep complete history for audit trail
2. **Encryption**: Enable default encryption:
   ```bash
   gcloud storage buckets update gs://quantcopier-releases \
     --default-encryption-key projects/PROJECT_ID/locations/global/keyRings/KEYRING/cryptoKeys/KEY
   ```

3. **Access Logging**: Enable logging:
   ```bash
   gsutil logging set on -b gs://logs-bucket -o log-object-prefix gs://quantcopier-releases
   ```

4. **Uniform Access**: Use uniform bucket-level access (recommended in Terraform config)

## Deployment Checklist

- [ ] Create GCS bucket with versioning enabled
- [ ] Configure lifecycle rules
- [ ] Set up IAM permissions for CI/CD and users
- [ ] Deploy Cloud Function (optional)
- [ ] Configure Cloud Scheduler (optional)
- [ ] Test with sample files
- [ ] Verify lifecycle rules work correctly
- [ ] Monitor for 30+ days to confirm archival
- [ ] Document bucket URL for developers

## References

- [GCS Lifecycle Documentation](https://cloud.google.com/storage/docs/lifecycle)
- [Storage Classes](https://cloud.google.com/storage/docs/storage-classes)
- [Terraform Google Provider - GCS](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/storage_bucket)
- [gsutil CLI Reference](https://cloud.google.com/storage/docs/gsutil)
