from simple_tts import simple_generate_speech
import os

def main():
    print("Testing TTS generation...")
    
    # Generate test audio
    result = simple_generate_speech("This is a test of the text to speech system.")
    
    if result['success']:
        print(f"TTS generation successful! Audio size: {len(result['audio'])} bytes")
        
        # Save to file for testing
        with open("test_audio.mp3", "wb") as f:
            import base64
            audio_data = base64.b64decode(result['audio'])
            f.write(audio_data)
            
        print(f"Saved to test_audio.mp3 - Try playing this file directly")
        
        # Try to play it if on a system with audio playback
        try:
            if os.name == 'posix':  # Linux/Mac
                os.system("play test_audio.mp3" if os.system("which play > /dev/null") == 0 else "afplay test_audio.mp3")
            elif os.name == 'nt':  # Windows
                os.system("start test_audio.mp3")
        except:
            pass
    else:
        print(f"TTS generation failed: {result.get('error', 'Unknown error')}")

if __name__ == "__main__":
    main() 