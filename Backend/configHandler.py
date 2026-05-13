import os
import sys
import json
import configparser

class config_ini:
    def __init__(self):
        self.config = configparser.ConfigParser()
        # Get the directory where the script is located, handling PyInstaller executable
        if getattr(sys, 'frozen', False):
            self.script_dir = os.path.dirname(sys.executable)
        else:
            self.script_dir = os.path.dirname(os.path.realpath(__file__))
        # Print both paths for debugging
        # print(f"Current working directory: {os.getcwd()}")
        # print(f"Script directory: {self.script_dir}")
        # Create absolute path for config.ini in parent of target directory
        parent_dir = os.path.dirname(os.path.dirname(self.script_dir)) if 'target' in self.script_dir else self.script_dir
        self.file_path = os.path.join(parent_dir, "config.ini")
        # print(f"Config file path: {self.file_path}")
        
    def populate_with_defaults(self):
        self.config.read(self.file_path)

        if self.config.has_section('SESSION_STRING'):
            return

        if "DEFAULT" not in self.config:
            self.config["DEFAULT"] = {}

        self.config["DEFAULT"].update({
            "console_log_output": "False",
            "eula_accepted": "False",
            "onboarding_complete": "False",
            "entry_price_variation_flag": "True",
            "risk_variation_flag": "True",
            "entry_time_variation": "1",
            "risk_percent": "1.0",
            "move_sl_breakeven_criteria": "TP1",
            "pending_order_time_expiration_minutes": "0",
            "close_opposite_positions_symbolwise": "True",
            "force_execute_market_orders": ""
        })

        with open(self.file_path, "w") as configfile:
            self.config.write(configfile)

    def save_new_session(self,sessionId):
        self.config.read(self.file_path)
        self.config['SESSION_STRING']={'session_string_key':sessionId}
        try:
            with open(self.file_path, 'w') as configfile:
                self.config.write(configfile)
            return True
        except:
            return False
        
    def update_config(self, section, key, value):
        self.config.read(self.file_path)
        if section == "DEFAULT":
            # Update default section directly
            self.config["DEFAULT"][key] = str(value)
        else:
            if not self.config.has_section(section):
               print(f"Section [{section}] not found. Creating it.")
               self.config.add_section(section)

            self.config.set(section, key, str(value))

        try:
            with open(self.file_path, 'w') as configfile:
                self.config.write(configfile)
            return True
        except:
            return False

    def save_number(self, phoneNumber):
        self.config.read(self.file_path)
        if 'TELEGRAM' not in self.config:
            self.config['TELEGRAM'] = {}
        self.config['TELEGRAM']['phone'] = phoneNumber
        try:
            with open(self.file_path, 'w') as configfile:
                self.config.write(configfile)
            return True
        except:
            return False
    
    def get_config_value(self, section, key):
        try:
            self.config.read(self.file_path)
            return self.config[section][key]
        except KeyError:
            return ''
    
    def get_details_from_config(self):
        self.config.read(self.file_path)
        data = {
        'session_string_key': self.get_config_value('SESSION_STRING', 'session_string_key'),
        'phone_number': self.get_config_value('TELEGRAM', 'phone'),
        'alerts_channel_id': self.get_config_value('TELEGRAM', 'alerts_channel_id'),
        'is_creator': False,  # Default value
        }
        return data
    
    def store_alerts_channel(self, payload: dict):
        try:
            self.config.read(self.file_path)
            # Ensure TELEGRAM section exists
            if 'TELEGRAM' not in self.config:
                self.config['TELEGRAM'] = {}
            
            self.config['TELEGRAM']['alerts_channel_name'] = payload['channel_name']
            self.config['TELEGRAM']['alerts_channel_id'] = str(payload['channel_id'])
            
            with open(self.file_path, 'w') as configfile:
                self.config.write(configfile)
            return True
        except Exception as e:
            print(e)
            return False
        
    def add_channel_id_data(self,channel_data):
        self.config.read(self.file_path)
        source_id=[]
        flag=False
        source_channel=[]
        for i,j in channel_data:
            source_id.append(i[1])
            source_channel.append(j[1])
        if 'TELEGRAM' not in self.config:
            self.config['TELEGRAM'] = {}
                        
        if 'source_channel_ids' not in self.config['TELEGRAM']:
            self.config['TELEGRAM']['source_channel_ids'] = ''
        if 'source_channel_names' not in self.config['TELEGRAM']:
            self.config['TELEGRAM']['source_channel_names'] = ''
            
        self.config.set('TELEGRAM', 'source_channel_ids', json.dumps(source_id))
        self.config.set('TELEGRAM', 'source_channel_names', json.dumps(source_channel))
        
        with open(self.file_path, 'w') as configfile:
            self.config.write(configfile)
            flag=True
        return flag 

    def check_mt5_password(self):
        """
        Checks if the MT5 section exists and has a non-empty password field
        Returns: bool indicating if a valid password exists
        """
        try:
            self.config.read(self.file_path)
            if self.config.has_section('MT5'):
                password = self.config.get('MT5', 'password', fallback='')
                return bool(password.strip())
            return False
        except:
            return False 

    def get_mt5_credentials(self):
        """
        Gets MT5 account credentials and license key from the config file.
        License key is read from the [LICENSE] section while comment and magic_number stay under [MT5].
        Returns: dict with account, password, server, license_key, comment, magic_number, etc.
        """
        self.config.read(self.file_path)
        credentials = {}
        if self.config.has_section('MT5'):
            credentials = {
                'account': self.config.get('MT5', 'account', fallback=''),
                'password': self.config.get('MT5', 'password', fallback=''),
                'server': self.config.get('MT5', 'server', fallback=''),
                'comment': self.config.get('MT5', 'comment', fallback=''),
                'magic_number': self.config.get('MT5', 'magic_number', fallback=''),
            }
        if self.config.has_section('LICENSE'):
            credentials['license_key'] = self.config.get('LICENSE', 'license_key', fallback='')
        return credentials if credentials else None
    
    def save_mt5_credentials(self, account, password, server, license_key):
        """Save MT5 credentials to config file"""
        if not self.config.has_section('MT5'):
            self.config.add_section('MT5')
            
        self.config.set('MT5', 'account', str(account))
        self.config.set('MT5', 'password', password)
        self.config.set('MT5', 'server', server)
        self.config.set('MT5', 'license_key', license_key)  # New field
        
        with open(self.file_path, 'w') as configfile:
            self.config.write(configfile)
        return True
