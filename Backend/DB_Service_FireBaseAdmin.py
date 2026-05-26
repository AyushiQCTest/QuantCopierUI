import os
import json
import pytz
from pprint import pprint
from datetime import datetime
from dateparser import parse
import firebase_admin
from firebase_admin import credentials, db

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
            try:
                # Check if Firebase is already initialized
                try:
                    self.ref = db.reference('/subscriberDetails')
                except ValueError:
                    # If not initialized, initialize Firebase
                    # Load credentials from environment variable
                    cred_json = os.getenv('FIREBASE_CREDENTIALS')
                    if not cred_json:
                        raise ValueError("FIREBASE_CREDENTIALS environment variable not set. "
                                       "Please set it to the Firebase service account JSON string or use FIREBASE_CREDENTIALS_PATH.")
                    
                    try:
                        cred_dict = json.loads(cred_json)
                    except json.JSONDecodeError:
                        raise ValueError("FIREBASE_CREDENTIALS is not valid JSON")
                    
                    cred = credentials.Certificate(cred_dict)
                    
                    db_url = os.getenv('FIREBASE_DATABASE_URL')
                    if not db_url:
                        raise ValueError("FIREBASE_DATABASE_URL environment variable not set")
                    
                    firebase_admin.initialize_app(cred, {
                        'databaseURL': db_url
                    })
                    self.ref = db.reference('/subscriberDetails')
                
                self._initialized = True
                
            except Exception as e:
                raise ConnectionError(f"Failed to initialize Firebase: {e}")

    def is_licenseKey_valid(self, license_key):
        """
        Check if a license key is valid based on its expiration date
        Returns: (bool, str, str) - (is_valid, subscription_type, product_type)
        """
        try:
            # Get all subscribers
            all_users = self.ref.get()
            if not all_users:
                return False, "", ""

            # Search for the license key
            for user_data in all_users.values():
                if "subscription" not in user_data:
                    continue

                for sub in user_data["subscription"]:
                    if sub.get("licenseKey") == license_key:
                        # If lifetime subscription, always valid
                        if sub.get("subscriptionType") == "lifetime":
                            return True, "lifetime", sub.get("productType", "")

                        # For other types, check expiration
                        if sub.get("expirationDate"):
                            expiry_date = parse(sub["expirationDate"])
                            if expiry_date:
                                # Convert current time to UTC if expiry_date is timezone-aware
                                current_time = datetime.now(pytz.UTC) if expiry_date.tzinfo else datetime.now()
                                return (
                                    current_time <= expiry_date,
                                    sub.get("subscriptionType", ""),
                                    sub.get("productType", "")
                                )

            return False, "", ""

        except Exception as e:
            print(f"Error checking license validity: {e}")
            return False, "", ""

    def is_valid_user(self, mobile):
        """
        Check if a user exists and has valid subscriptions
        Returns: 
            If valid user: True, {licenseKey: {expirationDate, productType}} (valid licenses)
            If invalid user: False, {licenseKey: {expirationDate, productType}} (invalid licenses)
        """
        try:
            # Check if we have cached subscription data
            if mobile in self._subscription_cache:
                user_data = {'subscription': self._subscription_cache[mobile]}
            else:
                # Get user data and cache the subscription
                user_data = self.ref.child(mobile).get()
                if user_data and 'subscription' in user_data:
                    self._subscription_cache[mobile] = user_data['subscription']
            # If no data found or no subscription
            if not user_data or 'subscription' not in user_data:
                return False, {}

            valid_licenses = {}
            invalid_licenses = {}
            has_valid_license = False

            for sub in user_data['subscription']:
                is_valid, sub_type, product_type = self.is_licenseKey_valid(sub['licenseKey'])
                license_info = {
                    'expirationDate': sub.get('expirationDate'),
                    'productType': product_type,
                    'subscriptionType': sub.get('subscriptionType', '')
                }

                if is_valid:
                    has_valid_license = True
                    valid_licenses[sub['licenseKey']] = license_info
                else:
                    invalid_licenses[sub['licenseKey']] = license_info

            return has_valid_license, valid_licenses if has_valid_license else invalid_licenses

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
            all_users = self.ref.get()
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
            all_data = self.ref.get()
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

# Usage example
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
    is_valid, sub_type, product_type = db_service.is_licenseKey_valid(license_key)
    print(f"\nLicense validity check for {license_key}: {is_valid} || Subscription Type: {sub_type} || Product Type: {product_type}")    
    
    # Test MT5 accounts
    success, accounts = db_service.get_valid_MT5_accounts(license_key)
    if success:
        print(f"\nMT5 Accounts associated with license key: {license_key}")
        for ac in accounts:
            pprint(ac)
    else:
        print("Error getting MT5 accounts")
