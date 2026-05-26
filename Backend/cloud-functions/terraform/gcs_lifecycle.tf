# Terraform configuration for QuantCopier releases GCS bucket lifecycle rules
# This sets up automatic archival of old versions to Archive storage

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "bucket_name" {
  description = "Name of the GCS bucket for releases"
  type        = string
  default     = "quantcopier-releases"
}

# GCS Bucket for releases with versioning and lifecycle rules
resource "google_storage_bucket" "releases" {
  name          = var.bucket_name
  location      = var.region
  force_destroy = false
  
  # Enable versioning to track file history
  versioning {
    enabled = true
  }
  
  # Lifecycle rules for automatic archival
  lifecycle_rule {
    # Rule 1: Move old versions to Archive storage after 30 days
    # This applies to all objects with specific prefixes
    condition {
      age                   = 30
      is_live               = false  # Only applies to non-current versions
      matches_storage_class = ["STANDARD"]
      # Optionally add prefix matching for version folders:
      # matches_prefix = ["v*/"]
    }
    action {
      type          = "SetStorageClass"
      storage_class = "ARCHIVE"
    }
  }
  
  # Rule 2: Alternative - Delete objects older than 90 days (optional)
  # Uncomment to enable
  # lifecycle_rule {
  #   condition {
  #     age                   = 90
  #     is_live               = false
  #     matches_storage_class = ["ARCHIVE"]
  #   }
  #   action {
  #     type = "Delete"
  #   }
  # }
  
  # Rule 3: Delete incomplete multipart uploads after 7 days
  lifecycle_rule {
    condition {
      num_newer_versions     = 0
      is_live                = false
      age_days               = 7
    }
    action {
      type = "Delete"
    }
  }
  
  # Enable uniform bucket-level access (recommended)
  uniform_bucket_level_access = true
  
  # CORS configuration if needed for downloads
  cors {
    origin          = ["https://releases.quanttradertools.com"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }
  
  labels = {
    app     = "quantcopier"
    purpose = "releases"
    managed = "terraform"
  }
}

# Bucket IAM binding for public read access (if needed)
resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.releases.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
  
  condition {
    title       = "Public read for versioned releases"
    description = "Allow public read access to versioned release files"
    expression  = "resource.matchesPrefix(['gs://${var.bucket_name}/v*']) && resource.name.endsWith('.exe')"
  }
}

# Cloud Function for managing archive (optional, for more granular control)
resource "google_cloudfunctions_function" "archive_old_releases" {
  name              = "archive-old-releases"
  description       = "Automatically moves old release versions to Archive storage"
  runtime           = "python311"
  available_memory  = 256
  source_archive_bucket = google_storage_bucket.function_source.name
  source_archive_object = google_storage_bucket_object.function_zip.name
  
  event_trigger {
    event_type = "google.pubsub.topic.publish"
    resource   = google_pubsub_topic.archive_trigger.id
  }
  
  entry_point = "archive_releases"
  
  environment_variables = {
    BUCKET_NAME = var.bucket_name
  }
  
  service_account_email = google_service_account.archive_function.email
}

# Pub/Sub topic for triggering the Cloud Function
resource "google_pubsub_topic" "archive_trigger" {
  name = "archive-old-releases"
  
  labels = {
    app = "quantcopier"
  }
}

# Cloud Scheduler job to trigger archive function daily at 2 AM UTC
resource "google_cloud_scheduler_job" "archive_schedule" {
  name        = "archive-old-releases-daily"
  description = "Trigger archive function daily to move old versions to Archive storage"
  schedule    = "0 2 * * *"  # Daily at 2 AM UTC
  region      = var.region
  time_zone   = "UTC"
  
  http_target {
    http_method = "POST"
    uri         = "https://www.googleapis.com/cloudpubsub/v1/projects/${var.project_id}/topics/${google_pubsub_topic.archive_trigger.name}:publish"
    
    oidc_token {
      service_account_email = google_service_account.scheduler.email
    }
  }
}

# Service account for Cloud Function
resource "google_service_account" "archive_function" {
  account_id   = "archive-old-releases"
  display_name = "Service account for archive-old-releases Cloud Function"
}

# Grant Cloud Function service account permission to read/write bucket
resource "google_storage_bucket_iam_member" "function_bucket_read" {
  bucket = google_storage_bucket.releases.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.archive_function.email}"
}

# Service account for Cloud Scheduler
resource "google_service_account" "scheduler" {
  account_id   = "cloud-scheduler-archive"
  display_name = "Service account for Cloud Scheduler archive job"
}

# Grant Scheduler service account permission to publish to Pub/Sub topic
resource "google_pubsub_topic_iam_member" "scheduler_publish" {
  topic  = google_pubsub_topic.archive_trigger.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.scheduler.email}"
}

# Outputs
output "bucket_name" {
  value       = google_storage_bucket.releases.name
  description = "Name of the releases bucket"
}

output "bucket_url" {
  value       = "gs://${google_storage_bucket.releases.name}"
  description = "GCS URL of the releases bucket"
}

output "lifecycle_rules_configured" {
  value       = true
  description = "Lifecycle rules have been configured for automatic archival"
}
