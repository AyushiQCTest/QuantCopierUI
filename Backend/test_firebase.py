import os
import json
from pathlib import Path
from dotenv import load_dotenv
from firebase_admin import credentials, db
import firebase_admin

# Check current directory and .env file
print("Current working directory:", os.getcwd())
env_file = Path(".env")
print(f".env file exists: {env_file.exists()}")
print(f".env file path: {env_file.absolute()}")

# Load the .env file explicitly
if env_file.exists():
    load_dotenv(env_file)
    print("✓ .env file loaded")
else:
    print("✗ .env file not found!")

# Check for credentials file path
cred_path = os.getenv('FIREBASE_CREDENTIALS_PATH')
print(f"FIREBASE_CREDENTIALS_PATH: {cred_path}")

if cred_path and Path(cred_path).exists():
    print(f"✓ Credentials file exists: {Path(cred_path).absolute()}")
    try:
        with open(cred_path, 'r') as f:
            cred_dict = json.load(f)
        print("✓ JSON valid")
        print("Project ID:", cred_dict.get('project_id'))
        print("Service Account Email:", cred_dict.get('client_email'))
        
        cred = credentials.Certificate(cred_dict)
        print("✓ Credentials object created")
        
        # Try to initialize Firebase (if not already done)
        try:
            firebase_admin.initialize_app(cred, {
                'databaseURL': os.getenv('FIREBASE_DATABASE_URL')
            })
        except ValueError:
            # Already initialized
            pass
        
        print("✓ Firebase initialized successfully!")
        
        ref = db.reference('/subscriberDetails')
        print("✓ Database reference created")
        
    except Exception as e:
        print(f"✗ Error: {e}")
else:
    print(f"✗ Credentials file not found at {cred_path}")
        print("Service Account Email:", cred_dict.get('client_email'))
        
        cred = credentials.Certificate(cred_dict)
        print("✓ Credentials object created")
        
        firebase_admin.initialize_app(cred, {
            'databaseURL': os.getenv('FIREBASE_DATABASE_URL')
        })
        print("✓ Firebase initialized successfully!")
        
        ref = db.reference('/subscriberDetails')
        print("✓ Database reference created")
        
    except Exception as e:
        print(f"✗ Error: {e}")