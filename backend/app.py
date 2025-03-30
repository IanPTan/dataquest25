import os
import base64
import json
import time
import datetime
import dotenv
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from openai import OpenAI
from elevenlabs import ElevenLabs

# Load environment variables
dotenv.load_dotenv()

# Configure API key
api_key = os.getenv("GEMINI_API_KEY")
gemini_base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY")

elevenlabs_client = ElevenLabs(api_key=elevenlabs_api_key)

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
    
    current_time = time.time()
    frame_id = data.get('frame_id', str(current_time)[-6:]) # Use frame_id from client if available
    print(f"[Frame {frame_id}] Received at {datetime.datetime.now().strftime('%H:%M:%S.%f')[:-3]}")

    if processing_lock:
        print(f"[Frame {frame_id}] Skipped: Lock held.")
        # Don't emit status here, client timeout handles this
        return
    
    if (current_time - last_process_time < 1.0):
        print(f"[Frame {frame_id}] Skipped: Rate limit.")
        return
    
    print(f"[Frame {frame_id}] Acquiring lock.")
    processing_lock = True
    
    try:
        image_data = data.get('data', '').split(',')[1] if ',' in data.get('data', '') else data.get('data', '')
        
        if not image_data:
            print(f"[Frame {frame_id}] Error: No image data.")
            emit('error', {'message': 'No image data received'})
            # No need to emit detection_result here, error handles unblocking
            # processing_lock = False # Finally block handles this
            return # Exit early

        print(f"[Frame {frame_id}] Calling detect_objects...")
        objects = []
        detection_error = None
        try:
            objects = detect_objects(image_data)
            print(f"[Frame {frame_id}] detect_objects returned {len(objects)} objects.")
        except Exception as e:
            detection_error = e
            print(f"[Frame {frame_id}] EXCEPTION during detect_objects: {str(e)}")
            import traceback
            traceback.print_exc()
            # Don't emit here, handle below

        # --- Response Handling ---
        if detection_error:
            print(f"[Frame {frame_id}] Emitting error due to detection exception.")
            emit('error', {'message': f'Detection error: {str(detection_error)}'})
            # Also emit empty result to ensure client listener is removed if it only listens for detection_result
            print(f"[Frame {frame_id}] Emitting empty detection_result after error.")
            emit('detection_result', {'objects': []})
        else:
            # Only process speech if objects are detected with good confidence
            audio_data = None
            audio_text = None
            
            # Check if we have a description in the response
            description = None
            if isinstance(objects, dict) and 'description' in objects:
                description = objects.get('description')
                object_list = objects.get('objects', [])
            else:
                # Handle legacy format (just an array of objects)
                object_list = objects if isinstance(objects, list) else []
            
            if object_list or description:
                # Prioritize the description for TTS if available
                if description:
                    text = description
                    print(f"[Frame {frame_id}] Using scene description: '{text}'")
                else:
                    # Fall back to the old object listing approach
                    object_names = [obj['label'] for obj in object_list if obj.get('confidence', 0) > 0.6]
                    if len(object_names) == 1:
                        text = f"I see a {object_names[0]} in the image."
                    else:
                        object_list_text = ", ".join(object_names[:-1]) + f" and {object_names[-1]}" if len(object_names) > 1 else object_names[0]
                        text = f"I see {object_list_text} in the image."
                
                print(f"[Frame {frame_id}] Generating speech for: '{text}'")
                
                try:
                    # Generate audio
                    audio_generator = elevenlabs_client.text_to_speech.convert(
                        text=text,
                        voice_id="JBFqnCBsd6RMkjVDRZzb",
                        model_id="eleven_multilingual_v2",
                        output_format="mp3_44100_128",
                    )
                    
                    # Collect all chunks from the generator into a single bytes object
                    audio_bytes = b''.join(chunk for chunk in audio_generator)
                    
                    # Convert the complete audio bytes to base64
                    audio_data = base64.b64encode(audio_bytes).decode('utf-8')
                    audio_text = text
                    
                    print(f"[Frame {frame_id}] Generated audio ({len(audio_data)} bytes)")
                except Exception as e:
                    print(f"[Frame {frame_id}] TTS error: {str(e)}")
                    # Continue without audio
            
            # Send detection results with audio if available
            result = {'objects': object_list if isinstance(object_list, list) else []}
            if audio_data:
                result['audio'] = {
                    'data': audio_data,
                    'format': 'mp3',
                    'text': audio_text
                }
            
            print(f"[Frame {frame_id}] Emitting detection_result with {len(object_list) if isinstance(object_list, list) else 0} objects" + 
                  (f" and audio" if audio_data else ""))
            emit('detection_result', result)

        # Update time only on successful processing or handled error
        last_process_time = current_time
        print(f"[Frame {frame_id}] Updated last_process_time.")

    except Exception as e:
        print(f"[Frame {frame_id}] EXCEPTION in handle_frame main block: {str(e)}")
        import traceback
        traceback.print_exc()
        print(f"[Frame {frame_id}] Emitting error due to main block exception.")
        emit('error', {'message': f'Server error: {str(e)}'})
        # Also emit empty result
        print(f"[Frame {frame_id}] Emitting empty detection_result after main block error.")
        emit('detection_result', {'objects': []})
        
    finally:
        print(f"[Frame {frame_id}] Releasing lock.")
        processing_lock = False

def detect_objects(image_data):
    """
    Detect objects in an image and generate a description for blind users
    """
    request_id = str(time.time())[-6:]
    print(f"[Detect {request_id}] Starting detection.")
    try:
        prompt = (
            f"INDEPENDENT REQUEST {request_id}: Analyze this new image only.\n"
            f"1. Return a JSON array of visible objects: [{{'label': 'object', 'confidence': 0.95, 'bbox': {{'x': 0.1, 'y': 0.2, 'width': 0.3, 'height': 0.4}}}}]\n"
            f"2. Include a 'description' field with a brief (1-2 sentences) description of the scene for a blind person.\n"
            f"Format: {{'objects': [...], 'description': 'A concise description of what's in the image.'}}\n"
            f"Use normalized coordinates (0-1). Return only JSON, no extra text."
        )
        print(f"[Detect {request_id}] Sending API request...")
        
        response = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}}
                    ],
                }
            ],
            max_tokens=2000,
            timeout=15.0 # Add an explicit timeout to the API call (e.g., 15 seconds)
        )
        
        result_text = response.choices[0].message.content
        print(f"[Detect {request_id}] Got API response ({len(result_text)} chars).")
        
        # Find JSON in the result
        start_idx = result_text.find('[')
        end_idx = result_text.rfind(']') + 1
        
        if start_idx >= 0 and end_idx > start_idx:
            json_str = result_text[start_idx:end_idx]
            try:
                objects = json.loads(json_str)
                print(f"[Detect {request_id}] Parsed {len(objects)} objects from substring.")
                return objects
            except json.JSONDecodeError as e:
                print(f"[Detect {request_id}] JSON parsing error in substring: {e}")
        
        # Try parsing the whole response
        try:
            objects = json.loads(result_text)
            if isinstance(objects, list):
                print(f"[Detect {request_id}] Parsed {len(objects)} objects from full response.")
                return objects
            else:
                print(f"[Detect {request_id}] Response is not a list.")
                return []
        except json.JSONDecodeError:
            print(f"[Detect {request_id}] Not JSON: {result_text[:100]}")
            return []
    
    except Exception as e:
        print(f"[Detect {request_id}] EXCEPTION during API call/processing: {str(e)}")
        import traceback
        traceback.print_exc()
        # Re-raise the exception so handle_frame catches it
        raise e

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
