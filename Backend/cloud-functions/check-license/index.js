const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { DateTime } = require("luxon");

// Initialize Firebase Admin SDK (uses default credentials in Cloud Function environment)
admin.initializeApp();

/**
 * Cloud Function: Check License by Phone Number
 * 
 * Accepts a phone number via HTTP request and validates the user's license
 * against Firestore/Realtime Database.
 * 
 * Replaces hardcoded private key logic with secure service account authentication.
 * 
 * @param {Object} req - Express request object
 *   - req.body.phoneNumber (string): Phone number to validate (e.g., "+1234567890")
 * @param {Object} res - Express response object
 * 
 * @returns {Object} JSON response with validation status and license details
 */
exports.checkLicense = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).send("");
    return;
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      status: "failed",
      message: "Method not allowed. Use POST.",
    });
  }

  try {
    const { phoneNumber } = req.body;

    // Validate input
    if (!phoneNumber || typeof phoneNumber !== "string") {
      return res.status(400).json({
        status: "failed",
        message: "Invalid input: phoneNumber is required",
      });
    }

    // Normalize phone number (ensure it starts with +)
    const normalizedPhone = phoneNumber.startsWith("+")
      ? phoneNumber
      : `+${phoneNumber}`;

    // Get reference to Realtime Database
    const db = admin.database();
    const subscriberRef = db.ref(`subscriberDetails/${normalizedPhone}`);

    // Fetch user data
    const snapshot = await subscriberRef.get();

    if (!snapshot.exists()) {
      return res.status(404).json({
        status: "failed",
        message: "User not found",
        phoneNumber: normalizedPhone,
      });
    }

    const userData = snapshot.val();

    // Check if subscriptions exist
    if (!userData.subscription || !Array.isArray(userData.subscription)) {
      return res.status(403).json({
        status: "failed",
        message: "User has no subscriptions",
        phoneNumber: normalizedPhone,
      });
    }

    // Validate each license
    const validLicenses = {};
    const invalidLicenses = {};

    for (const sub of userData.subscription) {
      const isValid = isLicenseValid(sub);
      const licenseInfo = {
        expirationDate: sub.expirationDate || null,
        productType: sub.productType || "",
        subscriptionType: sub.subscriptionType || "",
      };

      if (isValid) {
        validLicenses[sub.licenseKey] = licenseInfo;
      } else {
        invalidLicenses[sub.licenseKey] = licenseInfo;
      }
    }

    // Determine overall status
    const hasValidLicense = Object.keys(validLicenses).length > 0;

    if (hasValidLicense) {
      return res.status(200).json({
        status: "success",
        message: "User has valid license(s)",
        phoneNumber: normalizedPhone,
        licenseInfo: {
          valid: validLicenses,
          invalid: invalidLicenses,
        },
      });
    } else {
      return res.status(403).json({
        status: "failed",
        message: "User has no valid licenses",
        phoneNumber: normalizedPhone,
        licenseInfo: {
          valid: validLicenses,
          invalid: invalidLicenses,
        },
      });
    }
  } catch (error) {
    console.error("Error in checkLicense function:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
      details: error.message,
    });
  }
});

/**
 * Validates if a license is currently active based on expiration date
 * 
 * @param {Object} subscription - Subscription object from database
 * @returns {boolean} true if license is valid, false otherwise
 */
function isLicenseValid(subscription) {
  const expirationDate = subscription.expirationDate || "";

  // Empty expiration date = lifetime license
  if (!expirationDate || expirationDate.trim() === "") {
    return true;
  }

  try {
    // Parse expiration date using luxon for better date handling
    const expiryDateTime = DateTime.fromISO(expirationDate);

    if (!expiryDateTime.isValid) {
      console.warn(
        `Invalid date format for license ${subscription.licenseKey}: ${expirationDate}`
      );
      return false;
    }

    // Get current time in UTC
    const now = DateTime.now().toUTC();

    // License is valid if current time is before or equal to expiration
    return now <= expiryDateTime;
  } catch (error) {
    console.error(`Error parsing expiration date: ${expirationDate}`, error);
    return false;
  }
}

/**
 * Cloud Function: Validate Multiple Licenses
 * 
 * Accepts an array of license keys and validates each one against the database.
 * 
 * @param {Object} req - Express request object
 *   - req.body.licenseKeys (array): Array of license keys to validate
 * @param {Object} res - Express response object
 * 
 * @returns {Object} JSON response with validation status for each license
 */
exports.validateLicenseKeys = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).send("");
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      status: "failed",
      message: "Method not allowed. Use POST.",
    });
  }

  try {
    const { licenseKeys } = req.body;

    // Validate input
    if (!Array.isArray(licenseKeys) || licenseKeys.length === 0) {
      return res.status(400).json({
        status: "failed",
        message: "Invalid input: licenseKeys array is required",
      });
    }

    const db = admin.database();
    const resultsRef = db.ref("subscriberDetails");
    const snapshot = await resultsRef.get();

    if (!snapshot.exists()) {
      return res.status(404).json({
        status: "failed",
        message: "No subscriber data found",
      });
    }

    const allUsers = snapshot.val();
    const validatedLicenses = {};

    // Search for each license key in all users
    for (const licenseKey of licenseKeys) {
      let found = false;

      for (const [phone, userData] of Object.entries(allUsers)) {
        if (!userData.subscription) continue;

        for (const sub of userData.subscription) {
          if (sub.licenseKey === licenseKey) {
            validatedLicenses[licenseKey] = {
              isValid: isLicenseValid(sub),
              phoneNumber: phone,
              expirationDate: sub.expirationDate || null,
              productType: sub.productType || "",
              subscriptionType: sub.subscriptionType || "",
            };
            found = true;
            break;
          }
        }

        if (found) break;
      }

      if (!found) {
        validatedLicenses[licenseKey] = {
          isValid: false,
          message: "License key not found",
        };
      }
    }

    return res.status(200).json({
      status: "success",
      message: "License validation complete",
      validatedLicenses,
    });
  } catch (error) {
    console.error("Error in validateLicenseKeys function:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
      details: error.message,
    });
  }
});
