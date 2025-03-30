# EyeSee - AI-Powered Visual Assistant

## Overview

EyeSee is an AI-powered visual assistant that uses computer vision to detect objects and describe scenes in real-time. It's designed to help visually impaired users understand their surroundings through audio descriptions and can also serve as an educational tool for object recognition.

## Features

- **Real-time Object Detection**: Identifies objects in the camera feed with bounding boxes
- **Scene Description**: Generates natural language descriptions of what the camera sees
- **Text-to-Speech**: Converts descriptions to spoken audio for accessibility
- **Responsive UI**: Works on both desktop and mobile devices
- **Eye Animation**: Unique eye-themed interface with opening/closing animations

## Technology Stack

- **Frontend**: Next.js, React, TypeScript, Socket.IO client
- **Backend**: Flask, Python, Socket.IO server
- **AI Services**:
  - Gemini Vision API for object detection and scene description
  - ElevenLabs for high-quality text-to-speech

## Getting Started

### Prerequisites

- Node.js (v16+)
- Python (v3.9+)
- Google Gemini API key
- ElevenLabs API key

### Installation

1. **Clone the repository**
   ```
   git clone https://github.com/yourusername/eyesee.git
   cd eyesee
   ```

2. **Set up the backend**
   ```
   cd backend
   pip install -r requirements.txt
   ```

3. **Create a `.env` file in the backend directory with your API keys**
   ```
   GEMINI_API_KEY=your_gemini_api_key
   ELEVENLABS_API_KEY=your_elevenlabs_api_key
   ```

4. **Set up the frontend**
   ```
   cd ../app
   npm install
   ```

### Running the Application

1. **Start the backend server**
   ```
   cd backend
   python app.py
   ```

2. **Start the frontend development server**
   ```
   cd ../app
   npm run dev
   ```

3. **Open your browser** and navigate to `http://localhost:3000`

## Usage

1. Click the "Open Eyes" button to activate the camera
2. Allow camera permissions when prompted
3. Point your camera at objects or scenes you want to identify
4. The app will detect objects, draw bounding boxes, and speak descriptions
5. Toggle object detection visualization with the "Show/Hide Objects" button
6. Click "Close Eyes" to stop the camera feed

## Deployment

### Vercel (Frontend)

The frontend can be deployed to Vercel:

```
npm run build
vercel deploy
```

### Backend Deployment

The backend can be deployed to any platform that supports Python applications:

- Heroku
- Google Cloud Run
- AWS Elastic Beanstalk
- Railway

Remember to update the WebSocket connection URL in the frontend code to point to your deployed backend.

## Project Structure

```
├── app/                  # Frontend Next.js application
│   ├── components/       # React components
│   │   ├── camera.tsx    # Main camera component
│   │   └── camera.css    # Camera styling
│   └── page.tsx          # Main page component
├── backend/              # Flask backend
│   ├── app.py            # Main server file
│   ├── requirements.txt  # Python dependencies
│   ├── tts.py            # Text-to-speech utilities
│   └── simple_tts.py     # Simplified TTS implementation
└── vercel.json           # Vercel configuration
```

## Limitations

- Requires a stable internet connection for API calls
- Camera access requires HTTPS in production environments
- Object detection accuracy depends on lighting conditions and camera quality

## Future Improvements

- Offline mode with on-device models
- Support for multiple languages
- User profiles with customized voice preferences
- Improved object tracking between frames
- Haptic feedback for mobile devices

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Google Gemini API for vision capabilities
- ElevenLabs for natural-sounding TTS
- The open-source community for various libraries and tools
