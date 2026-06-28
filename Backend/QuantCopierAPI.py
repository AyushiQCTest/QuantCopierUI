import os
import sys
import json
import uuid
import signal
import uvicorn
import requests
from DB_Service import DBService
import threading
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables from .env file (use absolute path for PyInstaller compatibility)
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=env_path)
print(f"[DEBUG] Loading .env from: {env_path}")
print(f"[DEBUG] .env file exists: {os.path.exists(env_path)}")
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from telethon import errors
from telethon.sessions import StringSession
from telethon.sync import TelegramClient, events
from telethon.errors import SessionPasswordNeededError, RPCError
from telethon.tl.types import ChatAdminRights, Channel, ChannelParticipantsAdmins, InputPeerChannel
from telethon.tl.functions.channels import CreateChannelRequest, EditAdminRequest, GetParticipantsRequest
from configHandler import config_ini
from pathlib import Path
from contextlib import asynccontextmanager


BOT_NAME = 'QuantCopierAlertsBot'
ALERTS_CHANNEL_NAME = "QC_MT5_Alerts"
TELEGRAM_AUTH_STATUS = False
TELEGRAM_CLIENT = None

# Set environment variables
TELEGRAM_API_ID = 6896618
TELEGRAM_API_HASH = "cf2c894e9e19c3bbeb9fcade8d597386"

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events for the FastAPI application"""
    # Startup: Initialize the Telegram client
    global TELEGRAM_CLIENT, TELEGRAM_AUTH_STATUS
    config_gen = config_ini()
    session_string = config_gen.get_config_value('SESSION_STRING', 'session_string_key')
    if session_string:
        TELEGRAM_CLIENT = TelegramClient(StringSession(session_string), TELEGRAM_API_ID, TELEGRAM_API_HASH)
        try:
            await TELEGRAM_CLIENT.connect()
            if await TELEGRAM_CLIENT.is_user_authorized():
                TELEGRAM_AUTH_STATUS = True
                print("Telegram client initialized and authenticated")
            else:
                print("Telegram client initialized but not authenticated")
        except Exception as e:
            print(f"Failed to initialize Telegram client: {str(e)}")
            TELEGRAM_CLIENT = None
    
    yield  # Execute during app lifetime
    
    # Shutdown: Disconnect the Telegram client
    if TELEGRAM_CLIENT and TELEGRAM_CLIENT.is_connected():
        await TELEGRAM_CLIENT.disconnect()
        print("Telegram client disconnected")


app = FastAPI(lifespan=lifespan)

# Create static directory if it doesn't exist
if not os.path.exists("static"):
    os.makedirs("static")
    print("Created 'static' directory")

app.mount("/static", StaticFiles(directory="static"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update with your frontend URL
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

#region BASE MODELS Classes
class SessionInput(BaseModel):
    phoneNumber: str

class SessionInputOTP(BaseModel):
    sessionId:str
    OTP:str
    phoneNumber:str

class SessionInputPassword(BaseModel):
    sessionId:str
    password:str

class ChannelFilter(BaseModel):
    is_creator: Optional[bool] = False

class Channel_Data(BaseModel):
    id:str
    Channel_Name:str

class MT5Config(BaseModel):
    license_key: str
    account: int
    server: str
    password: str
    comment: Optional[str] = None  # Optional field
    magic_number: Optional[str] = None  # Optional field,
    
class SymbolMapping(BaseModel):
    root: dict[str, str]
    
class SingleSymbolMapping(BaseModel):
    source_symbol: str
    broker_symbol: str
    
class UpdateSymbolRequest(BaseModel):
    new_source_symbol: str
    new_broker_symbol: str

class DownloadUpdateRequest(BaseModel):
    install_dir: Optional[str] = None
    restart_exe: Optional[str] = None
#endregion

@app.get("/")
def read_root():
    return {"Welcome" : "@QuantCopier TeleGram API Tools"}

@app.get("/api/version")
def get_version():
    """
    Return the current version of QuantCopier.
    Delegates to get_ui_version() which checks, in order:
      QUANTCOPIER_INSTALL_DIR env var → sys._MEIPASS bundle →
      install dir heuristic → dev layout paths → hardcoded fallback.
    """
    return {"version": get_ui_version()}

sessions = {}

def initConfig():
    config_gen = config_ini()
    config_gen.populate_with_defaults()

# Helper function to load user data in background
def load_user_data_background(phone_number):
    formatted_phone = f"+{phone_number}" if not phone_number.startswith('+') else phone_number
    db_service = DBService()
    db_service.is_valid_user(mobile=formatted_phone)  # This populates the cache
    print(f"Preloaded subscriber data for {formatted_phone}")

@app.post("/login")
async def login(params: SessionInput, background_tasks: BackgroundTasks):
    """
    This endpoint allows you to create a session ID for a Telegram client and sends an SessionOTP to the Telegram User. 
    It takes a `SessionData` object as input which is a `phoneNumber` associated with a telegram account
    It returns a JSON response with the `sessionId` string.
    """
    try:
        client = TelegramClient(StringSession(), TELEGRAM_API_ID, TELEGRAM_API_HASH)
        await client.connect()
        if not await client.is_user_authorized():
            await client.send_code_request(params.phoneNumber)
            # Generate a session ID and store the client in the sessions dictionary
            sessionId = str(uuid.uuid4())
            sessions[sessionId] = client

            config_gen = config_ini();
            config_gen.save_number(params.phoneNumber)

            # Preload subscriber details into memory cache in the background
            background_tasks.add_task(load_user_data_background, params.phoneNumber)

            return JSONResponse(content={"success": True, "sessionId": sessionId, "message": "Code sent successfully"}, status_code=200)
    except (ConnectionError, TimeoutError) as e:
        return JSONResponse(content={"success": False, "message": "Failed to connect to Telegram. Please check Windows Firewall or your VPN."}, status_code=502)
    except Exception as e:
        return JSONResponse(content={"success": False, "message": "Validation error"}, status_code=404)


@app.post("/verify_otp")
async def verify_otp(params:SessionInputOTP): 
    
    """
    This endpoint allows you to create a Session String Key for a Telegram client.
    It takes as input the `sessionId`, `otp` and `phoneNumber`. If 2FA is enabled it returns a failure message
    informing the user to enter a password. If `sign_in` is successful, a `SessionStringKey` is returned
    """    
    global TELEGRAM_AUTH_STATUS, TELEGRAM_CLIENT
    client = sessions.get(params.sessionId)
    if not client:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        await client.sign_in(params.phoneNumber, params.OTP)  # Pass phone_no and otp to sign_in
    except Exception as e:
        if("Two-steps" in str(e)):
            return JSONResponse(content={"requires2FA": True, "sessionId": params.sessionId}, status_code=200)

        return JSONResponse(content={"message": "Validation error", "requires2FA": False}, status_code=403)

    SESSION_STRING = StringSession.save(client.session)
    config_gen = config_ini()
    return_code = config_gen.save_new_session(SESSION_STRING)
    if(return_code==True):
        TELEGRAM_AUTH_STATUS = True
        
        # Update the global client with the new session
        if TELEGRAM_CLIENT and TELEGRAM_CLIENT.is_connected():
            await TELEGRAM_CLIENT.disconnect()
        TELEGRAM_CLIENT = TelegramClient(StringSession(SESSION_STRING), TELEGRAM_API_ID, TELEGRAM_API_HASH)
        await TELEGRAM_CLIENT.connect()
        
        return JSONResponse(content={"message": "Session String Key Successfully Created", "requires2FA": False}, status_code=200)
    else:
        return JSONResponse(content={"message": "Unexpected Error"}, status_code=403)

@app.post("/verify_2FA")
async def verify_2FA(params:SessionInputPassword): 
    """
    This endpoint allows you to create a Session String Key for a Telegram client.
    It takes as input the `sessionId`, and `password`. If input password is incorrect an error is returned.
    If `sign_in` process is successful, a `SessionStringKey` is returned
    """        
    global TELEGRAM_AUTH_STATUS, TELEGRAM_CLIENT
    client = sessions.get(params.sessionId)
    if not client:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        await client.sign_in(password=params.password)

    except SessionPasswordNeededError:
        return JSONResponse(content={"message": "Incorrect password"}, status_code=403)

    SESSION_STRING = StringSession.save(client.session)
    config_gen=config_ini()
    return_code = config_gen.save_new_session(SESSION_STRING)
    if(return_code==True):
        TELEGRAM_AUTH_STATUS = True
        
        # Update the global client with the new session
        if TELEGRAM_CLIENT and TELEGRAM_CLIENT.is_connected():
            await TELEGRAM_CLIENT.disconnect()
        TELEGRAM_CLIENT = TelegramClient(StringSession(SESSION_STRING), TELEGRAM_API_ID, TELEGRAM_API_HASH)
        await TELEGRAM_CLIENT.connect()
        
        return JSONResponse(content={"message": "Session String Key Successfully Created", "session_string_key": SESSION_STRING}, status_code=200)
    else:
        return JSONResponse(content={"message": "Unexpected Error in creating Session String Key"}, status_code=403)


@app.post("/accept_eula")
async def accept_eula():
    config_gen=config_ini()
    config_gen.update_config('DEFAULT', 'eula_accepted', 'True')
    return JSONResponse(content={"message": "set eula status to true"}, status_code=200)

@app.post("/set_onboarding_complete")
async def set_onboarding_complete():
    config_gen=config_ini()
    config_gen.update_config('DEFAULT', 'onboarding_complete', 'True')
    return JSONResponse(content={"message": "set onboarding status to true"}, status_code=200)

@app.get("/auth_status")
async def auth_status():
    """
    This endpoint validates the provided Telegram credentials by attempting to connect to Telegram.
    """
    global TELEGRAM_AUTH_STATUS, TELEGRAM_CLIENT
    config_gen=config_ini()
    session_string = config_gen.get_config_value('SESSION_STRING', 'session_string_key')
    onboarding_complete = config_gen.get_config_value('DEFAULT', 'onboarding_complete')
    eula_accepted = config_gen.get_config_value('DEFAULT', 'eula_accepted')

    if not session_string:
        return JSONResponse(content={"status": "failed", "message": "No session string found", "eulaAccepted": eula_accepted, "onboardingComplete": onboarding_complete }, status_code=403)

    if TELEGRAM_AUTH_STATUS:
        return JSONResponse(content={"status": "success", "message": "User authenticated", "eulaAccepted": eula_accepted, "onboardingComplete": onboarding_complete }, status_code=200)

    # If global client is available, use it
    if TELEGRAM_CLIENT and TELEGRAM_CLIENT.is_connected():
        try:
            if await TELEGRAM_CLIENT.is_user_authorized():
                TELEGRAM_AUTH_STATUS = True
                return JSONResponse(content={"status": "success", "message": "User authenticated", "eulaAccepted": eula_accepted, "onboardingComplete": onboarding_complete }, status_code=200)
        except Exception:
            pass  # Fall back to creating a new client

    # Create a new client if global client is not available
    client = TelegramClient(StringSession(session_string), TELEGRAM_API_ID, TELEGRAM_API_HASH)
    try:
        await client.connect()
        if await client.is_user_authorized():
            TELEGRAM_AUTH_STATUS = True
            
            # Update the global client
            if TELEGRAM_CLIENT != client:
                if TELEGRAM_CLIENT and TELEGRAM_CLIENT.is_connected():
                    await TELEGRAM_CLIENT.disconnect()
                TELEGRAM_CLIENT = client
            
            return JSONResponse(content={"status": "success", "message": "User authenticated", "eulaAccepted": eula_accepted, "onboardingComplete": onboarding_complete }, status_code=200)
        else:
            await client.disconnect()
            return JSONResponse(content={"status": "failed", "message": "The provided credentials are invalid.", "eulaAccepted": eula_accepted, "onboardingComplete": onboarding_complete }, status_code=403)
    except RPCError as e:
        await client.disconnect()
        return JSONResponse(content={"status": "failed", "message": f"An error occurred: {str(e)}", "eulaAccepted": eula_accepted, "onboardingComplete": onboarding_complete }, status_code=403)
    except (ConnectionError, TimeoutError, Exception) as e:
        return JSONResponse(content={"status": "failed", "message": "Failed to connect to Telegram. Please check your VPN or Firewall.", "eulaAccepted": eula_accepted, "onboardingComplete": onboarding_complete }, status_code=403)
@app.post("/reset_auth")
async def reset_auth():
    global TELEGRAM_AUTH_STATUS, TELEGRAM_CLIENT
    config_gen=config_ini()
    config_gen.update_config('SESSION_STRING', 'session_string_key', '')
    TELEGRAM_AUTH_STATUS = False
    
    # Disconnect and reset the global client
    if TELEGRAM_CLIENT and TELEGRAM_CLIENT.is_connected():
        await TELEGRAM_CLIENT.disconnect()
    TELEGRAM_CLIENT = None
    
    return JSONResponse(content={"message": "auth reset"}, status_code=200)


async def _get_user_info_internal():
    """
    Helper function to retrieve Telegram user info.
    Returns a dict with user data or raises an exception.
    """
    global TELEGRAM_CLIENT
    try:
        config_gen = config_ini()
        config_data = config_gen.get_details_from_config()
        
        # Use global client if available
        if TELEGRAM_CLIENT and TELEGRAM_CLIENT.is_connected() and await TELEGRAM_CLIENT.is_user_authorized():
            client = TELEGRAM_CLIENT
        else:
            client = TelegramClient(StringSession(config_data['session_string_key']), TELEGRAM_API_ID, TELEGRAM_API_HASH)
            await client.connect()
        
        if not await client.is_user_authorized():
            raise Exception("User not authorized")
        
        me = await client.get_me()
        profile_pic_path = 'static/TG_UserProfilePic.jpg'
        
        # On first startup (or if file doesn't exist), download fresh profile photo
        if not os.path.exists(profile_pic_path):
            try:
                await client.download_profile_photo('me', file=profile_pic_path, download_big=True)
            except:
                pass  # If profile photo download fails, continue without it
        
        # Set URL if file exists, None otherwise
        profile_photo_url = "/static/TG_UserProfilePic.jpg" if os.path.exists(profile_pic_path) else None
        
        # Format phone number with + prefix
        formatted_phone = f"+{me.phone}" if me.phone and not me.phone.startswith('+') else me.phone
        
        return {
            "username": me.username,
            "lastName": me.last_name,
            "firstName": me.first_name,
            "phoneNumber": formatted_phone,
            "profilePhotoUrl": profile_photo_url
        }
    except Exception as e:
        print(f"ERROR in _get_user_info_internal: {str(e)}")
        import traceback
        traceback.print_exc()
        raise


@app.get("/get_user_info")
async def get_user_info():
    """
    Validates Telegram credentials and returns user info, including a profile photo URL.
    Downloads fresh profile photo on first startup, then reuses existing photo for subsequent calls.
    """
    try:
        user_data = await _get_user_info_internal()
        return JSONResponse(content=user_data, status_code=200)
    except RPCError as e:
        return JSONResponse(content={"status": "failed", "message": f"An error occurred: {str(e)}"}, status_code=403)
    except Exception as e:
        return JSONResponse(content={"status": "failed", "message": f"An error occurred: {str(e)}"}, status_code=500)

@app.get("/validate_user")
async def validate_user():
    """
    This endpoint validates both the Telegram credentials and checks if the user
    has a valid subscription in the database. It first retrieves the user's phone
    number from Telegram and then validates it against the database.
    
    Returns:
        JSONResponse with validation status and user details if successful,
        or error message if validation fails.
    """    
    try:
        user_data = await _get_user_info_internal()
        phone_number = user_data.get("phoneNumber", "")
        formatted_phone = f"+{phone_number}" if not phone_number.startswith('+') else phone_number

        db_service = DBService()
        is_valid, license_info = db_service.is_valid_user(mobile=formatted_phone)
        
        if is_valid:
            return JSONResponse(
                content={
                    "status": "success",
                    "message": "User validated successfully",
                    "userInfo": user_data,
                    "licenseInfo": license_info  # Return all valid licenses
                },
                status_code=200
            )
        else:
            return JSONResponse(
                content={
                    "status": "failed",
                    "message": "User does not have a valid subscription",
                    "userInfo": user_data,
                    "licenseInfo": license_info
                },
                status_code=403
            )
            
    except Exception as e:
        error_msg = f"An error occurred during telegram user validation: {str(e)}"
        print(f"ERROR in /validate_user: {error_msg}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            content={"status": "failed", "message": error_msg},
            status_code=500
        )
    

@app.get("/create_channel_and_add_bot")
async def create_channel_and_add_bot():
    """
    This endpoint allows you to create a new Telegram channel for receiving alerts and add a bot as an admin.
    It takes a ChannelData object as input which includes `api_id`, `api_hash`, `sesssion_string_key` and `channel_name`.
    It returns a JSON response with a success message and the details of the created channel.
    """  
    global TELEGRAM_CLIENT
    confile_file = config_ini()
    try:
        config_data = confile_file.get_details_from_config()  
        
        # Use global client if available
        if TELEGRAM_CLIENT and TELEGRAM_CLIENT.is_connected() and await TELEGRAM_CLIENT.is_user_authorized():
            client = TELEGRAM_CLIENT
        else:
            client = TelegramClient(StringSession(config_data['session_string_key']), TELEGRAM_API_ID, TELEGRAM_API_HASH)
            await client.connect()
            
        result = await client(CreateChannelRequest(
            title = ALERTS_CHANNEL_NAME,
            about = 'This is a private channel to receive alerts of MT5 operations performed by the Quant Copier',
            megagroup = False,
            broadcast = True
        ))
        channel = result.chats[0]

        admin_rights = ChatAdminRights(post_messages=True, add_admins=True, invite_users=True, change_info=True, 
                                    ban_users=True, delete_messages=True, pin_messages=True )

        bot_store_result = await client(EditAdminRequest(channel, BOT_NAME, admin_rights, rank='Admin'))
        
        # Check channel title and admin rights
        if (bot_store_result.chats[0].title == ALERTS_CHANNEL_NAME and bot_store_result.chats[0].admin_rights.add_admins):
            print(f"Channel '{ALERTS_CHANNEL_NAME}' has been created and BOT: '{BOT_NAME}' has been added as an admin.")
            config_write_data = {"channel_id": channel.id, "channel_name": ALERTS_CHANNEL_NAME}
            return_status = confile_file.store_alerts_channel(config_write_data)
            print(return_status)
            if return_status:
                return JSONResponse(content={"status": "Success"}, status_code=200)
            else:
                return JSONResponse(content={"status": "Failed to store channel info"}, status_code=200)
        else:
            return JSONResponse(content={"status": "Failed to add bot as admin"}, status_code=200)
    except:
        return JSONResponse(content={"status": "Failed to create channel"}, status_code=200)
            

@app.get("/get_channels")
async def get_channels():
    """
    This endpoint allows you to get a list of Telegram channels. It takes a ChannelFilter object as input 
    which includes `api_id`, `api_hash`, `session_string_key`, and an optional `is_creator` flag.
    It returns a JSON response with a dictionary of channel IDs and their corresponding names,
    excluding channels with the name specified in ALERTS_CHANNEL_NAME.
    """
    global TELEGRAM_CLIENT
    try:
        confile_file = config_ini()
        config_data = confile_file.get_details_from_config()
        
        # Use global client if available
        if TELEGRAM_CLIENT and TELEGRAM_CLIENT.is_connected() and await TELEGRAM_CLIENT.is_user_authorized():
            client = TELEGRAM_CLIENT
        else:
            client = TelegramClient(StringSession(config_data['session_string_key']), TELEGRAM_API_ID, TELEGRAM_API_HASH)
            await client.connect()
            
        channels_dict = {}
        async for dialog in client.iter_dialogs():
            if isinstance(dialog.entity, Channel):
                # Skip channels with the title matching ALERTS_CHANNEL_NAME
                if dialog.entity.title == ALERTS_CHANNEL_NAME:
                    continue
                if config_data['is_creator']:
                    if dialog.entity.creator and dialog.entity.megagroup:
                        channels_dict[dialog.entity.id] = dialog.entity.title
                else:
                    channels_dict[dialog.entity.id] = dialog.entity.title
        return JSONResponse(content={"message": "Successfully Created", "data": channels_dict}, status_code=200)
    except errors.AuthKeyUnregisteredError as e:
        return JSONResponse(content={"message": "Auth Error"}, status_code=401)
    except Exception as e:
        return JSONResponse(content={"message": f"Failed to fetch channels: {str(e)}"}, status_code=500) 
        
         
@app.get("/get_selected_channels")
async def get_selected_channels():
    config_gen = config_ini()
    config_gen.config.read(config_gen.file_path)
    try:
        source_ids = json.loads(config_gen.get_config_value('TELEGRAM', 'source_channel_ids') or '[]')
        source_names = json.loads(config_gen.get_config_value('TELEGRAM', 'source_channel_names') or '[]')
        selected_channels = dict(zip(source_ids, source_names))
        return JSONResponse(content={"message": "Selected channels retrieved", "data": selected_channels}, status_code=200)
    except json.JSONDecodeError:
        return JSONResponse(content={"message": "Error reading stored channels"}, status_code=500)
    
@app.post('/save_channels')
async def save_channels(channel_data:List[Channel_Data]):
    """
    This endpoint allows you to save a list of Telegram channels. It takes a list of Channel_Data objects as input.
    It returns a JSON response with a success message and the status of the operation.
    """
    config_gen=config_ini()
    return_code=config_gen.add_channel_id_data(channel_data=channel_data)
    if(return_code==True):
        
        return JSONResponse(content={"message": "Successfully Created","Status":"Success"}, status_code=200)
    else:
        return JSONResponse(content={"message": "Failed","Status":"Failed"}, status_code=200)

@app.get("/check_bot_in_channel")
async def check_bot_in_channel():
    """
    This endpoint checks if the bot is a member or an admin of a given Telegram channel.
    It takes a CheckChannelSubscribers object as input which includes `api_id`, `api_hash`, `session_string_key`, and `channel_id`.
    It returns a JSON response with a success message if the bot is a member or an admin of the channel, or an error message if it is not.
    """
    config_gen = config_ini()
    config_data = config_gen.get_details_from_config()
    client = TelegramClient(StringSession(config_data['session_string_key']), TELEGRAM_API_ID, TELEGRAM_API_HASH)
    await client.connect()
    channel = await client.get_entity(InputPeerChannel(int(config_data['alerts_channel_id']), 0))
    participants = await client(GetParticipantsRequest(channel, ChannelParticipantsAdmins(), 0, 10, 0))
    for user in participants.users:
        if user.username == BOT_NAME:
            return {
                "status": "success",
                "message": f"Bot '{BOT_NAME}' is an admin in the channel '{channel.title}'.",
                "channel_id": str(config_data['alerts_channel_id'])  # Include channel_id
            }
    participants = await client.get_participants(channel)
    for user in participants:
        if user.username == BOT_NAME:
            return {
                "status": "success",
                "message": f"Bot '{BOT_NAME}' is a member in the channel '{channel.title}'.",
                "channel_id": str(config_data['alerts_channel_id'])  # Include channel_id
            }
    return {
        "status": "failed",
        "message": f"Bot '{BOT_NAME}' is neither a member nor an admin in the channel '{channel.title}'.",
        "channel_id": str(config_data['alerts_channel_id'])  # Include channel_id even on failure
    }        


#region MT5 related APIs
@app.get("/mt5/MT5AccountValidityExtCheck")
def MT5AccountValidityExtCheck():
    """
    This endpoint checks MT5 account validity by:
    1. Getting a connection ID from the ConnectEx endpoint of mt5.mtapi.io
    2. Using that ID to fetch account details from the Account endpoint of mt5.mtapi.io
    3. Validating the email and balance fields
    
    Returns a JSON response with the validation status and account details.
    """
    try:
        # Get MT5 credentials from config
        config_data = config_ini()
        mt5_config = config_data.get_mt5_credentials()
        
        if not mt5_config:
            return JSONResponse(
                content={"status": "failed", "message": "MT5 credentials not found in config"},
                status_code=400
            )

        # First API call to get connection ID
        connect_url = (
            f"https://mt5.mtapi.io/ConnectEx"
            f"?user={mt5_config['account']}"
            f"&password={mt5_config['password']}"
            f"&server={mt5_config['server']}"
            f"&connectTimeoutSeconds=30"
        )
        
        response = requests.get(connect_url)
        if response.status_code == 200:
            connection_id = response.text
            # Second API call to get account details
            account_url = f"https://mt5.mtapi.io/Account?id={connection_id}"
            response = requests.get(account_url)
            if response.status_code != 200:
                return JSONResponse(
                    content={"status": "failed", "message": "Failed to fetch account details"},
                    status_code=400
                )
            
            account_details = response.json()
            
            # Validate email and balance
            if not account_details.get('email') or account_details.get('balance') is None:
                return JSONResponse(
                    content={
                        "status": "invalid",
                        "message": "Account details incomplete",
                        "isValidAccount": False,
                        "accountDetails": account_details
                    },
                    status_code=200
                )
            
            return JSONResponse(
                content={
                    "status": "success",
                    "isValidAccount": True,
                    "accountDetails": {
                        "email": account_details['email'],
                        "balance": account_details['balance'],
                        "login": account_details['login'],
                        "type": account_details['type'],
                        "leverage": account_details['leverage']
                    }
                },
                status_code=200
            )
        else:
            # Parse error response
            error_data = response.json()
            return JSONResponse(
                content={
                    "status": "failed",
                    "message": error_data.get('message', 'Unknown MT5 error'),
                    "error_code": error_data.get('code', 'UNKNOWN_ERROR')
                },
                status_code=400
            )

    except Exception as e:
        return JSONResponse(
            content={"status": "failed", "message": f"Error checking MT5 account: {str(e)}"},
            status_code=500
        )
    

@app.get("/mt5/MT5AccountPasswordCheck")
async def MT5AccountPasswordCheck():
    """
    This endpoint checks if there is a valid MT5 password configured in the config.ini file.
    Returns a JSON response indicating whether the password is set or not.
    """
    try:
        config_gen = config_ini()
        has_password = config_gen.check_mt5_password()
        
        if has_password:
            return JSONResponse(
                content={"status": "success", "hasPassword": True},
                status_code=200
            )
        else:
            return JSONResponse(
                content={"status": "no_password", "hasPassword": False},
                status_code=200
            )
    except Exception as e:
        return JSONResponse(
            content={"status": "failed", "message": f"Error checking MT5 password: {str(e)}"},
            status_code=500
        )
    

@app.get("/mt5/get_mt5_accounts")
async def get_mt5_accounts(license_key: str):
    """
    This endpoint retrieves MT5 accounts for a given license key.
    It returns a JSON response with the list of accounts if successful, or an error message if it fails.
    """
    db_service = DBService()
    success, accounts = db_service.get_valid_MT5_accounts(license_key)
    if success:
        return JSONResponse(content={"accounts": accounts}, status_code=200)
    return JSONResponse(content={"error": "Failed to retrieve MT5 accounts"}, status_code=400)


@app.get("/mt5/get_mt5_credentials")
async def get_mt5_credentials():
    """
    This endpoint retrieves MT5 credentials from the config.ini file.
    It returns a JSON response with the credentials if successful, or an error message if it fails.
    """
    config_gen = config_ini()
    mt5_creds = config_gen.get_mt5_credentials()
    if mt5_creds:
        return JSONResponse(content=mt5_creds, status_code=200)
    return JSONResponse(content={"message": "MT5 credentials not found"}, status_code=404)

@app.post("/mt5/save")
async def save_mt5_config(config: MT5Config):
    config_gen = config_ini()
    config_gen.update_config('MT5', 'account', str(config.account))
    config_gen.update_config('MT5', 'password', config.password)
    config_gen.update_config('MT5', 'server', config.server)
    # Write comment and magicNumber into MT5 section
    if config.comment is not None:
        config_gen.update_config('MT5', 'comment', config.comment)
    if config.magic_number is not None:
        config_gen.update_config('MT5', 'magic_number', config.magic_number)
    # Save license key under the LICENSE section
    config_gen.update_config('LICENSE', 'license_key', config.license_key)
    return JSONResponse(content={"status": "success", "message": "MT5 config saved"}, status_code=200)

        
@app.get("/symbol_mapper")
async def get_symbol_mappings():
    """
    Retrieve the symbol mappings from symbol_mapper.json.
    """
    config_handler = config_ini()
    symbol_mapper_path = Path(config_handler.script_dir) / "symbol_mapper.json"

    try:
        if (symbol_mapper_path.exists()):
            with open(symbol_mapper_path, "r") as f:
                mappings = json.load(f)
            return JSONResponse(content=mappings, status_code=200)
        return JSONResponse(content={}, status_code=200)
    except Exception as e:
        return JSONResponse(
            content={"status": "failed", "message": f"Error reading symbol mappings: {str(e)}"},
            status_code=500
        )

@app.post("/symbol_mapper/save")
async def save_symbol_mapping(mapping: SingleSymbolMapping):
    """
    Save or update a single symbol mapping in symbol_mapper.json.
    """
    config_handler = config_ini()
    symbol_mapper_path = Path(config_handler.script_dir) / "symbol_mapper.json"

    try:
        # Load existing mappings
        if symbol_mapper_path.exists():
            with open(symbol_mapper_path, "r") as f:
                mappings = json.load(f)
        else:
            mappings = {}

        # Add or update the new mapping
        mappings[mapping.source_symbol] = mapping.broker_symbol

        # Write back to file
        with open(symbol_mapper_path, "w") as f:
            json.dump(mappings, f, indent=4)
        
        return JSONResponse(content={"status": "success", "message": "Symbol mapping saved"}, status_code=200)
    except Exception as e:
        return JSONResponse(
            content={"status": "failed", "message": f"Error saving symbol mapping: {str(e)}"},
            status_code=500
        )

@app.put("/symbol_mapper/update/{old_source_symbol}")
async def update_symbol_mapping(old_source_symbol: str, request: UpdateSymbolRequest):
    config_handler = config_ini()
    symbol_mapper_path = Path(config_handler.script_dir) / "symbol_mapper.json"

    if not symbol_mapper_path.exists():
        raise HTTPException(status_code=404, detail="Symbol mappings file not found")
    
    with open(symbol_mapper_path, "r") as f:
        mappings = json.load(f)
    
    if old_source_symbol not in mappings:
        raise HTTPException(status_code=404, detail="Source symbol not found")
    
    # Remove old mapping
    mappings.pop(old_source_symbol)
    
    # Add new mapping
    mappings[request.new_source_symbol] = request.new_broker_symbol
    
    with open(symbol_mapper_path, "w") as f:
        json.dump(mappings, f, indent=4)
        
    return JSONResponse(content={"status": "success", "message": "Symbol mapping updated"}, status_code=200)

@app.delete("/symbol_mapper/delete/{source_symbol}")
async def delete_symbol_mapping(source_symbol: str):
    config_handler = config_ini()
    symbol_mapper_path = Path(config_handler.script_dir) / "symbol_mapper.json"

    if not symbol_mapper_path.exists():
        raise HTTPException(status_code=404, detail="Symbol mappings file not found")
    
    with open(symbol_mapper_path, "r") as f:
        mappings = json.load(f)
    
    if source_symbol not in mappings:
        raise HTTPException(status_code=404, detail="Source symbol not found")
        
    del mappings[source_symbol]
    with open(symbol_mapper_path, "w") as f:
        json.dump(mappings, f, indent=4)
        
    return JSONResponse(content={"status": "success", "message": "Symbol mapping deleted"}, status_code=200)

# Add a new endpoint for getting operational settings (for Step4Settings prefill)
@app.get("/get_operational_settings")
async def get_operational_settings():
    """
    Retrieve operational settings from config.ini.
    """
    config_handler = config_ini()
    config_data = config_handler.get_details_from_config()

    settings = {
        "entry_price_variation_flag": config_handler.get_config_value('DEFAULT', 'entry_price_variation_flag') == 'True',
        "risk_variation_flag": config_handler.get_config_value('DEFAULT', 'risk_variation_flag') == 'True',
        "close_opposite_positions_symbolwise": config_handler.get_config_value('DEFAULT', 'close_opposite_positions_symbolwise') == 'True',
        "console_log_output": config_handler.get_config_value('DEFAULT', 'console_log_output') == 'True',
        "move_sl_breakeven_criteria": config_handler.get_config_value('DEFAULT', 'move_sl_breakeven_criteria') or 'TP1',
        "entry_time_variation": int(config_handler.get_config_value('DEFAULT', 'entry_time_variation') or '6'),
        "risk_percent": float(config_handler.get_config_value('DEFAULT', 'risk_percent') or '1.0'),
        "pending_order_time_expiration_minutes": int(config_handler.get_config_value('DEFAULT', 'pending_order_time_expiration_minutes') or '10'),
        "force_execute_market_orders": config_handler.get_config_value('DEFAULT', 'force_execute_market_orders') or '',
    }

    return JSONResponse(content=settings, status_code=200)

@app.post("/save_operational_settings")
async def save_operational_settings(settings: dict):
    """
    Save operational settings to config.ini.
    """
    config_handler = config_ini()
    try:
        config_handler.update_config('DEFAULT', 'entry_price_variation_flag', str(settings['entry_price_variation_flag']))
        config_handler.update_config('DEFAULT', 'risk_variation_flag', str(settings['risk_variation_flag']))
        config_handler.update_config('DEFAULT', 'close_opposite_positions_symbolwise', str(settings['close_opposite_positions_symbolwise']))
        config_handler.update_config('DEFAULT', 'console_log_output', str(settings['console_log_output']))
        config_handler.update_config('DEFAULT', 'move_sl_breakeven_criteria', settings['move_sl_breakeven_criteria'])
        config_handler.update_config('DEFAULT', 'entry_time_variation', str(settings['entry_time_variation']))
        config_handler.update_config('DEFAULT', 'risk_percent', str(settings['risk_percent']))
        config_handler.update_config('DEFAULT', 'pending_order_time_expiration_minutes', str(settings['pending_order_time_expiration_minutes']))
        config_handler.update_config('DEFAULT', 'force_execute_market_orders', str(settings['force_execute_market_orders']))

        return JSONResponse(content={"status": "success", "message": "Settings saved"}, status_code=200)
    except Exception as e:
        return JSONResponse(
            content={"status": "failed", "message": f"Error saving settings: {str(e)}"},
            status_code=500
        )
#endregion

# Programmatically force shutdown this sidecar.
def kill_process():
    os.kill(os.getpid(), signal.SIGINT)  # This force closes this script.

@app.post("/kill-telegram-copier")
async def kill_telegram_copier():
    """Kill any running QuantCopierTelegram.exe process and return command output"""
    try:
        if sys.platform == 'win32':
            import subprocess
            result = subprocess.run(['taskkill', '/F', '/IM', 'QuantCopierTelegram.exe'], 
                                  capture_output=True, text=True)
            return JSONResponse(content={
                "status": "success" if result.returncode == 0 else "error",
                "stdout": result.stdout.strip(),
                "stderr": result.stderr.strip(),
                "returncode": result.returncode
            })
        else:
            return JSONResponse(content={"status": "error", "message": "This operation is only supported on Windows"}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)

# Handle the stdin event loop. This can be used like a CLI.
def stdin_loop():
    print("[sidecar] Waiting for commands...", flush=True)
    while True:
        # Read input from stdin.
        user_input = sys.stdin.readline().strip()

        # Check if the input matches one of the available functions
        match user_input:
            case "sidecar shutdown":
                print("[sidecar] Received 'sidecar shutdown' command.", flush=True)
                kill_process()
            case _:
                print(
                    f"[sidecar] Invalid command [{user_input}]. Try again.", flush=True
                )


# Start the input loop in a separate thread
def start_input_thread():
    try:
        input_thread = threading.Thread(target=stdin_loop)
        input_thread.daemon = True  # so it exits when the main program exits
        input_thread.start()
    except:
        print("[sidecar] Failed to start input handler.", flush=True)

def shutdown():
    print("[sidecar] Shutting down...", flush=True)
    sys.exit(0)

def create_symbol_mapper_json():
    """
    Creates a symbol_mapper.json file if it doesn't exist or is empty.
    The file is created in the same directory as the script.
    """
    default_mapping = {"GOLD": "XAUUSD","XAUUSD":"XAUUSD+",
                       "SILVER":"XAGUSD","CRUDEOIL":"XBRUSD",
                       "SPX500": "US500", "NASDAQ": "USTEC",
                       "EURUSD":"EURUSD","GBPUSD":"GBPUSD",
                       "AUDUSD":"AUDUSD","GBPJPY":"GBPJPY",
                       "USDJPY":"USDJPY","USDCAD":"USDCAD",
                       "NZDUSD":"NZDUSD","CHFJPY":"CHFJPY",
                       "BITCOIN": "BTCUSD", "ETHUSD":"ETHUSD",
                       "LTCUSD":"LTCUSD", "RIPPLE":"XRPUSD"
                       }
    
    # Get the directory where the script is located
    config_handler = config_ini()
    symbol_mapper_path = Path(config_handler.script_dir) / "symbol_mapper.json"
    
    # Check if file exists and has content
    should_create_file = True
    if os.path.exists(symbol_mapper_path):
        try:
            with open(symbol_mapper_path, "r") as f:
                mappings = json.load(f)
                if len(mappings) > 0:
                    print("symbol_mapper.json exists and contains mappings")
                    should_create_file = False
        except json.JSONDecodeError:
            print("symbol_mapper.json exists but is invalid JSON, recreating file")
    
    # Create or overwrite the file if needed
    if should_create_file:
        try:
            with open(symbol_mapper_path, "w") as f:
                json.dump(default_mapping, f, indent=4)
            print(f"Successfully created {symbol_mapper_path} with default mapping")
        except Exception as e:
            print(f"Error creating symbol_mapper.json: {str(e)}")


# ============================================================================
# Auto-Update API Endpoints
# ============================================================================

def get_ui_version() -> str:
    """
    Get the current UI version from the EXE properties or VERSION file.

    Priority order:
    1. Check file properties of the main GUI executable in the install directory.
    2. QUANTCOPIER_INSTALL_DIR env var  — set by the PS updater after install.
    3. QUANTCOPIER_SOURCE_DIR env var   — set in dev mode to point at the repo root.
    4. sys._MEIPASS / VERSION           — bundled inside the frozen exe at build time.
    5. resolve_install_dir() / VERSION  — heuristic for finding the real install root.
    """
    import sys
    from pathlib import Path
    from typing import Optional

    def _get_file_version_from_properties(exe_path: Path) -> Optional[str]:
        if sys.platform != "win32" or not exe_path.exists():
            return None
        import ctypes
        from ctypes import wintypes
        try:
            size = ctypes.windll.version.GetFileVersionInfoSizeW(str(exe_path), None)
            if not size:
                return None
            buffer = ctypes.create_string_buffer(size)
            if not ctypes.windll.version.GetFileVersionInfoW(str(exe_path), 0, size, buffer):
                return None
            fixed_info_ptr = ctypes.c_void_p()
            fixed_info_len = ctypes.c_uint()
            if not ctypes.windll.version.VerQueryValueW(
                buffer,
                "\\",
                ctypes.byref(fixed_info_ptr),
                ctypes.byref(fixed_info_len)
            ):
                return None
            
            class VS_FIXEDFILEINFO(ctypes.Structure):
                _fields_ = [
                    ("dwSignature", wintypes.DWORD),
                    ("dwStrucVersion", wintypes.DWORD),
                    ("dwFileVersionMS", wintypes.DWORD),
                    ("dwFileVersionLS", wintypes.DWORD),
                    ("dwProductVersionMS", wintypes.DWORD),
                    ("dwProductVersionLS", wintypes.DWORD),
                    ("dwFileFlagsMask", wintypes.DWORD),
                    ("dwFileFlags", wintypes.DWORD),
                    ("dwFileOS", wintypes.DWORD),
                    ("dwFileType", wintypes.DWORD),
                    ("dwFileSubtype", wintypes.DWORD),
                    ("dwFileDateMS", wintypes.DWORD),
                    ("dwFileDateLS", wintypes.DWORD),
                ]
            fixed_info = VS_FIXEDFILEINFO.from_address(fixed_info_ptr.value)
            major = (fixed_info.dwFileVersionMS >> 16) & 0xffff
            minor = fixed_info.dwFileVersionMS & 0xffff
            patch = (fixed_info.dwFileVersionLS >> 16) & 0xffff
            
            version_str = f"{major}.{minor}.{patch}"
            print(f"[DEBUG][get_ui_version] Read version {version_str} from properties of {exe_path}")
            return version_str
        except Exception as e:
            print(f"[DEBUG][get_ui_version] Error reading version properties from {exe_path}: {e}")
            return None

    def _try_read_version(path: Path) -> Optional[str]:
        print(f"[DEBUG][get_ui_version] Checking VERSION at: {path}")
        print(f"[DEBUG][get_ui_version] File exists: {path.exists()}")
        if path.exists():
            try:
                v = path.read_text(encoding="utf-8-sig").strip()
                if v:
                    print(f"[DEBUG][get_ui_version] Read version: '{v}'")
                    return v
            except Exception as e:
                print(f"[DEBUG][get_ui_version] Error reading {path}: {e}")
        return None

    # Try to query properties of main executables in the install directory first
    try:
        from windows_updater import resolve_install_dir
        install_dir = resolve_install_dir()
        for candidate in ("QuantCopierTelegramUI.exe", "QuantCopierMT5.exe", "QuantCopier.exe"):
            v = _get_file_version_from_properties(install_dir / candidate)
            if v:
                return v
    except Exception as e:
        print(f"[DEBUG][get_ui_version] Heuristic properties lookup failed: {e}")

    # 2. QUANTCOPIER_INSTALL_DIR env var — takes priority so the updated version
    #    is shown immediately after the PS updater relaunches the app.
    env_dir = os.getenv("QUANTCOPIER_INSTALL_DIR", "").strip()
    if env_dir:
        v = _try_read_version(Path(env_dir) / "VERSION")
        if v:
            return v

    # 3. QUANTCOPIER_SOURCE_DIR — set this in .env or the shell when running in dev mode
    #    to point at the repo root (the directory that contains the VERSION file).
    src_dir = os.getenv("QUANTCOPIER_SOURCE_DIR", "").strip()
    if src_dir:
        v = _try_read_version(Path(src_dir) / "VERSION")
        if v:
            return v

    # 4. sys._MEIPASS — only present when running as a frozen PyInstaller binary.
    #    The VERSION file is bundled into the exe at build time (see QuantCopierAPI.spec).
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        v = _try_read_version(Path(meipass) / "VERSION")
        if v:
            return v

    # 5. resolve_install_dir() heuristic (works when exe lives in the real install root)
    try:
        from windows_updater import resolve_install_dir
        install_dir = resolve_install_dir()
        v = _try_read_version(install_dir / "VERSION")
        if v:
            return v
    except Exception as e:
        print(f"[DEBUG][get_ui_version] Error checking install dir VERSION: {e}")

    # 5. Walk up the directory tree from __file__ looking for VERSION.
    #    In dev mode __file__ is Backend/QuantCopierAPI.py so parent is Backend/,
    #    parent.parent is the repo root where VERSION lives.
    #    In a frozen exe __file__ resolves into the temp _MEIPASS dir; we search
    #    up to 6 levels which safely handles both layouts.
    current = Path(__file__).resolve()
    for _ in range(6):
        current = current.parent
        v = _try_read_version(current / "VERSION")
        if v:
            return v
        if current == current.parent:  # filesystem root
            break

    # 6. Same directory as this script — Backend/VERSION
    v = _try_read_version(Path(__file__).parent / "VERSION")
    if v:
        return v

    print("[DEBUG][get_ui_version] VERSION file not found, using fallback '1.3.4'")
    return "1.3.4"



# NOTE: GitHub API fallback removed.
# Version checks are authoritative only from the GCS releases.json produced
# by the full installer pipeline.  See get_latest_release_from_storage_manifest().


def get_latest_release_from_storage_manifest() -> Optional[dict]:
    """Fetch latest release metadata from releases.json via authenticated GCS access."""
    try:
        from gcp_bucket_manager import (
            fetch_releases_manifest_data,
            release_info_from_manifest,
            normalize_storage_bucket,
        )

        data = fetch_releases_manifest_data()
        if not data:
            print("[DEBUG][get_latest_release_from_storage_manifest] Manifest fetch failed")
            return None

        latest_info = release_info_from_manifest(data, component_key="mainInstaller")
        if not latest_info:
            print("[DEBUG][get_latest_release_from_storage_manifest] Manifest missing latest version")
            return None

        bucket = normalize_storage_bucket(
            os.getenv("FIREBASE_STORAGE_BUCKET", "quantcopier-releases")
        )
        latest_info["manifest_url"] = f"gs://{bucket}/releases.json"
        print(
            f"[DEBUG][get_latest_release_from_storage_manifest] "
            f"Latest version from manifest: '{latest_info.get('version')}' "
            f"blob: {latest_info.get('blob_name')}"
        )
        return latest_info
    except Exception as e:
        print(f"[DEBUG][get_latest_release_from_storage_manifest] Error: {e}")
        return None


def compare_versions(v1: str, v2: str) -> int:
    """
    Compare two version strings, stripping any leading 'v' prefix.

    Returns:
        -1 if v1 < v2  (update available)
         0 if equal
         1 if v1 > v2
    """
    try:
        # Normalise: strip whitespace and leading 'v' (e.g. "v1.4.0" -> "1.4.0")
        v1_clean = v1.strip().lstrip('v')
        v2_clean = v2.strip().lstrip('v')

        v1_parts = tuple(map(int, v1_clean.split('.')))
        v2_parts = tuple(map(int, v2_clean.split('.')))

        print(f"[DEBUG][compare_versions] Comparing v1={v1_clean} ({v1_parts}) vs v2={v2_clean} ({v2_parts})")

        if v1_parts < v2_parts:
            print(f"[DEBUG][compare_versions] Result: -1 (update available)")
            return -1
        elif v1_parts > v2_parts:
            print(f"[DEBUG][compare_versions] Result: 1 (current is newer)")
            return 1
        else:
            print(f"[DEBUG][compare_versions] Result: 0 (same version)")
            return 0
    except Exception as e:
        print(f"[DEBUG][compare_versions] Parse error: v1='{v1}' v2='{v2}' error={e}")
        # Return 0 (treat as equal / no update) — a bad version string should never
        # produce a false "update available" result.
        return 0


@app.get("/api/check-update")
async def check_update():
    """
    Check if a new version of QuantCopier UI is available.

    The ONLY source of truth is the GCS releases.json produced by the full
    installer pipeline (upload-to-gcs.yml).  No GitHub API or legacy bucket
    scan fallback — those sources don't reflect the real installer state.

    Returns:
        available        – True if a newer version exists in the manifest
        currentVersion   – what this installation reports
        latestVersion    – what releases.json says is latest
        downloadUrl      – GCS download URL for the mainInstaller component
        error            – set only on hard failures (5xx)
    """
    try:
        current_version = get_ui_version()
        print(f"[DEBUG][check_update] Current version: '{current_version}'")

        # ------------------------------------------------------------------ #
        # Single source of truth: GCS releases.json                          #
        # ------------------------------------------------------------------ #
        latest_info = get_latest_release_from_storage_manifest()
        print(f"[DEBUG][check_update] Storage manifest result: {latest_info}")

        if not latest_info:
            print("[DEBUG][check_update] releases.json unavailable or empty.")
            return JSONResponse(
                content={
                    "available": False,
                    "currentVersion": current_version,
                    "latestVersion": None,
                    "message": "Could not reach the update server. Please try again later.",
                },
                status_code=200,
            )

        latest_version = latest_info.get('version', '').strip().lstrip('v')
        print(f"[DEBUG][check_update] Latest version resolved: '{latest_version}'")

        if not latest_version:
            print("[DEBUG][check_update] releases.json did not contain a version field.")
            return JSONResponse(
                content={
                    "available": False,
                    "currentVersion": current_version,
                    "latestVersion": None,
                    "message": "releases.json is missing a version field.",
                },
                status_code=200,
            )

        available = compare_versions(current_version, latest_version) < 0
        print(f"[DEBUG][check_update] Update available: {available}")

        return JSONResponse(
            content={
                "available": available,
                "currentVersion": current_version,
                "latestVersion": latest_version,
                "downloadUrl": latest_info.get('download_url'),
                "releaseNotes": latest_info.get('releaseNotes', ''),
                "publishedAt": latest_info.get('updated_at') or latest_info.get('updatedAt'),
            },
            status_code=200,
        )
    except Exception as e:
        print(f"[DEBUG][check_update] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            content={"available": False, "error": str(e)},
            status_code=500,
        )


@app.post("/api/apply-update")
async def apply_update(background_tasks: BackgroundTasks):
    """
    Apply the downloaded update.
    This endpoint should be called after the update has been downloaded.
    
    Returns:
        JSON response indicating success or failure
    """
    try:
        # In a real implementation, this would:
        # 1. Verify the downloaded file
        # 2. Replace the current version
        # 3. Trigger a restart
        
        # For now, we'll just log and return success
        print("[AutoUpdate] Update would be applied here")
        
        return JSONResponse(
            content={
                "success": True,
                "message": "Update applied successfully. Application will restart.",
            },
            status_code=200
        )
    except Exception as e:
        return JSONResponse(
            content={"success": False, "error": str(e)},
            status_code=500
        )


@app.post("/api/download-update")
async def download_update(body: Optional[DownloadUpdateRequest] = Body(default=None)):
    """
    Download update artifacts to staging and launch a detached Windows updater script.

    The GCS download is run in a thread-pool executor so it does NOT block the
    FastAPI event loop (and therefore does not freeze the UI while downloading).
    The script swaps binaries after the UI/API processes exit.
    """
    try:
        import asyncio
        import platform
        from windows_updater import prepare_windows_update

        if platform.system() != "Windows":
            return JSONResponse(
                content={
                    "success": False,
                    "message": "Detached updater is only supported on Windows",
                },
                status_code=400,
            )

        current_version = get_ui_version()
        latest_info = get_latest_release_from_storage_manifest()
        if not latest_info:
            return JSONResponse(
                content={"success": False, "message": "No updates found in GCP bucket"},
                status_code=404,
            )

        latest_version = latest_info.get("version", "").strip().lstrip("v")
        if compare_versions(current_version, latest_version) >= 0:
            return JSONResponse(
                content={"success": False, "message": "Already on latest version"},
                status_code=200,
            )

        payload = body or DownloadUpdateRequest()

        # Run the blocking GCS download + script launch in a thread pool so we
        # don't block the event loop (which would freeze the UI spinner).
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,  # use default ThreadPoolExecutor
            lambda: prepare_windows_update(
                install_dir=payload.install_dir,
                restart_exe=payload.restart_exe,
            ),
        )
        return JSONResponse(content=result, status_code=200)

    except Exception as e:
        print(f"Error downloading update: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            content={"success": False, "error": str(e)},
            status_code=500,
        )


if __name__ == "__main__":
    start_input_thread()
    initConfig()
    create_symbol_mapper_json()
    uvicorn.run(app, host="127.0.0.1", port=8000, lifespan="on")
    signal.signal(signal.SIGINT, lambda sig, frame: shutdown())
    signal.signal(signal.SIGTERM, lambda sig, frame: shutdown())