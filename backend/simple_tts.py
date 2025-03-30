import os
import base64
import io
import tempfile
import gtts

def simple_generate_speech(text, lang='en'):
    """
    Generate speech using Google Text-to-Speech (gTTS)
    
    Args:
        text (str): Text to convert to speech
        lang (str): Language code (default: 'en')
        
    Returns:
        dict: Result containing audio data and success status
    """
    try:
        print(f"Generating speech for text: '{text}'")
        
        # Create a temporary file
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as temp_file:
            temp_path = temp_file.name
        
        # Generate the speech file
        tts = gtts.gTTS(text=text, lang=lang, slow=False)
        tts.save(temp_path)
        
        # Read the file
        with open(temp_path, 'rb') as audio_file:
            audio_data = audio_file.read()
            
        # Clean up the file
        try:
            os.remove(temp_path)
        except:
            pass
            
        # Convert to base64
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        
        print(f"Speech generated successfully, size: {len(audio_base64)} bytes")
        
        return {
            'audio': audio_base64,
            'format': 'mp3',
            'success': True
        }
        
    except Exception as e:
        print(f"Error generating speech: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        } 