from kokoro import KPipeline
import soundfile as sf
import io
import base64

# Initialize the pipeline once when module is loaded
pipeline = KPipeline(lang_code='a')

def generate_speech(text, voice='af_heart', save_file=False, filename=None):
    """
    Generate speech from text using Kokoro TTS.
    
    Args:
        text (str): The text to convert to speech
        voice (str): Voice ID to use
        save_file (bool): Whether to save audio to a file
        filename (str): Filename to save audio (if save_file is True)
        
    Returns:
        dict: Contains audio data in base64 format and sample rate
    """
    try:
        # Generate audio
        generator = pipeline(text, voice=voice)
        
        # Get the first generated audio segment
        for i, (gs, ps, audio) in enumerate(generator):
            # Only process the first segment for now
            if save_file:
                output_filename = filename or f'speech_{i}.wav'
                sf.write(output_filename, audio, 24000)
                
            # Convert to base64 for sending over HTTP/WebSocket
            audio_bytes = io.BytesIO()
            sf.write(audio_bytes, audio, 24000, format='WAV')
            audio_bytes.seek(0)
            audio_base64 = base64.b64encode(audio_bytes.read()).decode('utf-8')
            
            return {
                'audio': audio_base64,
                'sample_rate': 24000,
                'success': True
            }
            
        # If no audio was generated
        return {
            'success': False,
            'error': 'No audio generated'
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }