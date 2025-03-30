import os
import base64
import json
import time
import dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from openai import OpenAI

# Load environment variables
dotenv.load_dotenv()

# Configure API key
api_key = os.getenv("GEMINI_API_KEY")
gemini_base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"

# Initialize OpenAI client pointing to Gemini API
client = OpenAI(
    api_key=api_key,
    base_url=gemini_base_url
)

# Set the model to use - easy to change later
VISION_MODEL = "gemini-2.0-flash"

# Initialize Flask and Socket.IO
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")

# Track active connections and processing state
connected_clients = 0
last_process_time = 0
processing_lock = False

@socketio.on('connect')
def handle_connect():
    global connected_clients
    connected_clients += 1
    print(f"Client connected. Total clients: {connected_clients}")
    emit('status', {'status': 'connected'})

@socketio.on('disconnect')
def handle_disconnect():
    global connected_clients
    connected_clients -= 1
    print(f"Client disconnected. Total clients: {connected_clients}")

@socketio.on('frame')
def handle_frame(data):
    global last_process_time, processing_lock
    
    # Rate limiting to prevent overloading the API
    current_time = time.time()
    if processing_lock or (current_time - last_process_time < 1.0):  # Min 1 second between API calls
        emit('status', {'status': 'throttled'})
        return
    
    try:
        processing_lock = True
        image_data = data.get('data', '').split(',')[1] if ',' in data.get('data', '') else data.get('data', '')
        
        if not image_data:
            emit('error', {'message': 'No image data received'})
            processing_lock = False
            return
        
        # Process with vision model
        try:
            objects = detect_objects(image_data)
            emit('detection_result', {'objects': objects})
        except Exception as e:
            print(f"Vision API error: {str(e)}")
            emit('error', {'message': f'API Error: {str(e)}'})
        
        last_process_time = time.time()
    except Exception as e:
        emit('error', {'message': f'Server Error: {str(e)}'})
    finally:
        processing_lock = False

def detect_objects(image_data):
    """
    Detect objects in an image using the OpenAI client with Gemini model
    """
    try:
        # Object detection prompt
        prompt = ("Identify all objects in this image. Return a JSON array with objects in this format: " +
                 "[{\"label\": \"object name\", \"confidence\": 0.95, \"bbox\": {\"x\": 0.1, \"y\": 0.2, \"width\": 0.3, \"height\": 0.4}}]" +
                 "where bbox values are normalized between 0 and 1 (x,y is top-left corner). Only return the JSON, no other text.")
        
        # Call the model using OpenAI client
        response = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt,
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_data}"
                            },
                        },
                    ],
                }
            ],
            max_tokens=2000
        )
        
        # Extract the JSON data
        result_text = response.choices[0].message.content
        
        # Find JSON in the result
        start_idx = result_text.find('[')
        end_idx = result_text.rfind(']') + 1
        
        if start_idx >= 0 and end_idx > start_idx:
            json_str = result_text[start_idx:end_idx]
            objects = json.loads(json_str)
            return objects
        else:
            # Attempt to parse the whole response as JSON
            try:
                return json.loads(result_text)
            except json.JSONDecodeError:
                # If JSON parsing fails, return a structured error with the text result
                print(f"Could not parse JSON from: {result_text[:200]}")
                return [{"label": "Parsing Error", "confidence": 0, "bbox": {"x": 0, "y": 0, "width": 0, "height": 0}, "raw_text": result_text[:200]}]
    
    except Exception as e:
        print(f"Error in object detection: {str(e)}")
        raise

# Keep the REST API endpoint as an alternative
@app.route('/detect', methods=['POST'])
def detect_objects_http():
    try:
        data = request.json
        image_data = data["image"].split(",")[1]  # Remove Base64 header
        
        objects = detect_objects(image_data)
        return jsonify({"objects": objects})
    except Exception as e:
        return jsonify({"error": f"Error: {str(e)}"}), 500

# Function to update model and/or API key
def update_client(new_model=None, new_api_key=None, new_base_url=None):
    global client, VISION_MODEL
    
    if new_model:
        VISION_MODEL = new_model
        print(f"Model updated to: {VISION_MODEL}")
    
    # Only recreate client if API key or base URL changes
    if new_api_key or new_base_url:
        client = OpenAI(
            api_key=new_api_key or api_key,
            base_url=new_base_url or gemini_base_url
        )
        print("API client updated")

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    print(f"Starting server on port {port}")
    print(f"Using model: {VISION_MODEL}")
    socketio.run(app, host='0.0.0.0', port=port, debug=True, allow_unsafe_werkzeug=True)
