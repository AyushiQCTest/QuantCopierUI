import os
import requests
from datetime import datetime, timedelta
from dateparser import parse
from pprint import pprint
import pytz

"""
Database secrets are currently deprecated and use a legacy Firebase token generator.
Update your source code with the Firebase Admin SDK. See DB_Service_FireBaseAdmin.py
"""

class DBService:
    _instance = None
    _initialized = False
    
    # Cache to store subscription details by mobile number
    _subscription_cache = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DBService, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if not self._initialized:
            # Get database URL and auth token from environment variables
            self.base_url = os.getenv('FIREBASE_DATABASE_URL')
            self.auth_token = os.getenv('FIREBASE_AUTH_TOKEN')
            
            if not self.base_url:
                raise ValueError("FIREBASE_DATABASE_URL environment variable not set")
            if not self.auth_token:
                raise ValueError("FIREBASE_AUTH_TOKEN environment variable not set")
            
            self._initialized = True

    def _make_request(self, path):
        """Helper method to make authenticated GET requests"""
        url = f"{self.base_url}{path}.json"
        params = {'auth': self.auth_token}
        response = requests.get(url, params=params)
        if response.status_code == 200:
            return response.json()
        raise ConnectionError(f"Failed to fetch data: {response.status_code}")

    def is_licenseKey_valid(self, license_key):
        """
        Check if a license key is valid based on its expiration date.
        Returns: (bool, str, str) - (is_valid, subscription_type, product_type)
        
        Logic:
          - If subscriptionType is "lifetime": always valid.
          - If an explicit expirationDate exists, validate against it.
          - Otherwise, calculate expiration from subscriptionDate based on:
                * monthly: +30 days
                * half-yearly: +182 days
                * yearly: +365 days
          - A license is valid if the current datetime is <= the computed expiration.
        """
        try:
            # Search in cached subscription data first
            for subscriptions in self._subscription_cache.values():
                for sub in subscriptions:
                    if sub.get("licenseKey") == license_key:
                        exp_str = sub.get("expirationDate", "").strip()
                        if not exp_str:
                            # No expiration date, treat as lifetime
                            return True, sub.get("subscriptionType", ""), sub.get("productType", "")
                        else:
                            # Use explicit expiration date
                            expiry_date = parse(exp_str)
                            if expiry_date:
                                # Convert current time to UTC if expiry_date is timezone-aware
                                current_time = datetime.now(pytz.UTC) if expiry_date.tzinfo else datetime.now()
                                if current_time <= expiry_date:
                                    return True, sub.get("subscriptionType", ""), sub.get("productType", "")
                                else:
                                    return False, sub.get("subscriptionType", ""), sub.get("productType", "")
            
            # If not found in cache, query all subscribers
            all_users = self._make_request('/subscriberDetails')
            if not all_users:
                return False, "", ""

            for user_data in all_users.values():
                if "subscription" not in user_data:
                    continue
                for sub in user_data["subscription"]:
                    if sub.get("licenseKey") == license_key:
                        exp_str = sub.get("expirationDate", "").strip()
                        if not exp_str:
                            # No expiration date, treat as lifetime
                            return True, sub.get("subscriptionType", ""), sub.get("productType", "")
                        else:
                            # Use explicit expiration date
                            expiry_date = parse(exp_str)
                            if expiry_date:
                                # Convert current time to UTC if expiry_date is timezone-aware
                                current_time = datetime.now(pytz.UTC) if expiry_date.tzinfo else datetime.now()
                                if current_time <= expiry_date:
                                    return True, sub.get("subscriptionType", ""), sub.get("productType", "")
                                else:
                                    return False, sub.get("subscriptionType", ""), sub.get("productType", "")
            return False, "", ""
        except Exception as e:
            print(f"Error checking license validity: {e}")
            return False, "", ""

    def is_valid_user(self, mobile):
        """
        Check if a user exists and has subscriptions.
        Returns:
            (bool, dict) where the dict has two keys:
              - "valid": {licenseKey: {expirationDate, productType, subscriptionType}} for valid licenses,
              - "invalid": {licenseKey: {expirationDate, productType, subscriptionType}} for invalid licenses.
        """
        try:
            # Check if we have cached subscription data
            if mobile in self._subscription_cache:
                user_data = {'subscription': self._subscription_cache[mobile]}
            else:
                # Get user data and cache the subscription
                user_data = self._make_request(f'/subscriberDetails/{mobile}')
                if user_data and 'subscription' in user_data:
                    self._subscription_cache[mobile] = user_data['subscription']
            # If no data found or no subscription
            if not user_data or 'subscription' not in user_data:
                return False, {}

            valid_licenses = {}
            invalid_licenses = {}

            for sub in user_data['subscription']:
                is_valid, sub_type, product_type = self.is_licenseKey_valid(sub['licenseKey'])
                license_info = {
                    'expirationDate': sub.get('expirationDate'),
                    'productType': product_type,
                    'subscriptionType': sub.get('subscriptionType', '')
                }
                if is_valid:
                    valid_licenses[sub['licenseKey']] = license_info
                else:
                    invalid_licenses[sub['licenseKey']] = license_info

            # If there is at least one valid license, return True plus the full details.
            has_valid = len(valid_licenses) > 0
            return has_valid, {"valid": valid_licenses, "invalid": invalid_licenses}
        except Exception as e:
            print(f"Error checking user validity: {e}")
            return False, {}

    def get_valid_MT5_accounts(self, license_key):
        """
        Get all MT5 accounts associated with a license key and their validity status
        """
        try:
            # Search in cached subscription data first
            for mobile, subscriptions in self._subscription_cache.items():
                for sub in subscriptions:
                    if sub.get("licenseKey") == license_key:
                        mt5_accounts = []
                        # Handle both single account (dict) and multiple accounts (list) cases
                        if isinstance(sub.get('mt5_accounts'), dict):
                            if sub['mt5_accounts']:  # Check if not empty
                                mt5_accounts = [sub['mt5_accounts']]
                        elif isinstance(sub.get('mt5_accounts'), list):
                            mt5_accounts = [acc for acc in sub['mt5_accounts'] if acc]

                        # Check if license is valid
                        is_valid, _, _ = self.is_licenseKey_valid(license_key)
                        # Add validity status to each account
                        for account in mt5_accounts:
                            account['licenseKey'] = license_key
                            account['licenseKeyValid'] = is_valid
                        return True, mt5_accounts
            
            # If not found in cache, query all subscribers
            all_users = self._make_request('/subscriberDetails')
            if not all_users:
                return False, []

            # Search for the license key
            for mobile, user_data in all_users.items():
                if "subscription" not in user_data:
                    continue
                
                # Cache the subscription data if not already cached
                if mobile not in self._subscription_cache:
                    self._subscription_cache[mobile] = user_data["subscription"]
                    
                for sub in user_data["subscription"]:
                    if sub.get("licenseKey") == license_key:
                        mt5_accounts = []
                        # Handle both single account (dict) and multiple accounts (list) cases
                        if isinstance(sub.get('mt5_accounts'), dict):
                            if sub['mt5_accounts']:  # Check if not empty
                                mt5_accounts = [sub['mt5_accounts']]
                        elif isinstance(sub.get('mt5_accounts'), list):
                            mt5_accounts = [acc for acc in sub['mt5_accounts'] if acc]

                        # Check if license is valid
                        is_valid, _, _ = self.is_licenseKey_valid(license_key)
                        # Add validity status to each account
                        for account in mt5_accounts:
                            account['licenseKey'] = license_key
                            account['licenseKeyValid'] = is_valid
                        return True, mt5_accounts
            return False, []
        except Exception as e:
            print(f"Error getting MT5 accounts: {e}")
            return False, []

    def list_all_collections_and_documents(self):
        """
        Lists all subscriber details in the database.
        """
        try:
            all_data = self._make_request('/subscriberDetails')
            if not all_data:
                return False, {}

            print("\nCollection: subscriberDetails")
            print(f"Number of documents: {len(all_data)}")
            print("DOCUMENTS:")
            pprint(all_data)
            return True, {"subscriberDetails": all_data}
        except Exception as e:
            print(f"Error listing documents: {e}")
            return False, {}

if __name__ == "__main__":
    db_service = DBService()
    
    # Test user validity
    user_mobile_nr = "+917708385855"
    is_valid, license_info = db_service.is_valid_user(user_mobile_nr)
    print(f"User validity check for {user_mobile_nr}: {is_valid}")
    print("License info:")
    pprint(license_info)
    if not is_valid:
        print(f"Invalid licenses: {license_info}")

    # Test license validity
    license_key = "QC-TG-M12-250329-DIRA-6372517F"
    is_valid_lk, sub_type, product_type = db_service.is_licenseKey_valid(license_key)
    print(f"\nLicense validity check for {license_key}: {is_valid_lk} || Subscription Type: {sub_type} || Product Type: {product_type}")    
    
    # Test MT5 accounts
    success, accounts = db_service.get_valid_MT5_accounts(license_key)
    if success:
        print(f"\nMT5 Accounts associated with license key: {license_key}")
        for ac in accounts:
            pprint(ac)
    else:
        print("Error getting MT5 accounts")
