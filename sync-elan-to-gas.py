import os
import json
import argparse
import datetime
import requests

def load_config(config_file='config.json'):
    if not os.path.exists(config_file):
        raise FileNotFoundError(f"Configuration file {config_file} not found.")
    with open(config_file, 'r') as f:
        return json.load(f)

def extract_list(data):
    """Recursively search for a list structure containing our items."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, str):
                try:
                    parsed = json.loads(value)
                    res = extract_list(parsed)
                    if res is not None: return res
                except:
                    pass
            elif isinstance(value, (dict, list)):
                res = extract_list(value)
                if res is not None: return res
    return None

def fetch_data(token, url_template, days):
    end_date = datetime.date.today() + datetime.timedelta(days=1)
    start_date = end_date - datetime.timedelta(days=days)
    
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    # Fill placeholders in the URL template
    url = url_template.format(start_str, end_str)
    
    headers = {
        'usertoken': token
    }
    
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()

def filter_sanger(data):
    items = extract_list(data)
    if not items:
        print("Could not find a list of items in the API response.")
        return []

    filtered = []
    for item in items:
        template_name = item.get('TemplateName', '')
        if template_name and 'Sanger' in template_name:
            # Kaust Infinity ID extraction (IdeaElan)
            roll_number = str(item.get('RollNumber', ''))
            infinity_id = roll_number[-5:] if len(roll_number) >= 5 else roll_number
            if not infinity_id:
                # fallback to SampleSubmissionId
                infinity_id = str(item.get('SampleSubmissionId', ''))[-5:]
                
            filtered.append({
                'Infinity': infinity_id,
                'Reactions': item.get('NumberOfSamples', ''),
                'User': item.get('User', '')
            })
    return filtered

def send_to_gas(gas_url, payload):
    headers = {'Content-Type': 'application/json'}
    response = requests.post(gas_url, json=payload, headers=headers)
    response.raise_for_status()
    print("Send to GAS:", response.text)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync Sanger Sequencing data to Google Sheets")
    parser.add_argument('--days', type=int, default=7, help='Number of days to go back')
    parser.add_argument('--gas-url', type=str, help='Google Apps Script Web App URL (overrides config.json)')
    parser.add_argument('--config', type=str, default='config.json', help='Path to config.json file')
    
    args = parser.parse_args()
    
    try:
        config = load_config(args.config)
        token = config.get('usertoken')
        elan_url = config.get('elan_url')
        gas_url = args.gas_url or config.get('gas_url')
        
        if not token or not elan_url:
            raise ValueError("Missing 'usertoken' or 'elan_url' in config file.")

        print(f"Fetching data from IdeaElan for the last {args.days} days...")
        raw_data = fetch_data(token, elan_url, args.days)
        sanger_data = filter_sanger(raw_data)
        print(f"Found {len(sanger_data)} records for Sanger Sequencing.")
        
        if sanger_data:
            print("Successfully fetched data from IdeaElan:")
            print(json.dumps(sanger_data, indent=2))
            
            if gas_url:
                print(f"Sending payload to Google Apps Script at {gas_url}...")
                send_to_gas(gas_url, sanger_data)
            else:
                print("Note: 'gas_url' not provided. Skipping upload to Google Sheets.")
        else:
            print("No records found, skipping upload.")
    except Exception as e:
        print(f"Error occurred: {e}")
