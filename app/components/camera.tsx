'use client';

import { useEffect, useRef, useState } from 'react';

// Simplified version for testing camera only
export default function Camera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  // Start camera feed
  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment' // Use back camera on mobile devices
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current!.play()
            .then(() => {
              setIsCameraActive(true);
              setError(null);
              console.log("Camera started successfully");
            })
            .catch(err => {
              setError("Failed to play video: " + err.message);
              console.error("Failed to play video:", err);
            });
        };
      }
    } catch (err) {
      setError('Could not access camera: ' + (err instanceof Error ? err.message : String(err)));
      console.error('Error accessing camera:', err);
    }
  };
  
  // Stop camera feed
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
      
      // Clear the canvas when camera is stopped
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    }
  };
  
  // Process video frames - simplified for testing
  useEffect(() => {
    if (!isCameraActive || !videoRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas) return;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    // Set canvas size to match video
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    console.log(`Canvas size set to: ${canvas.width}x${canvas.height}`);
    console.log(`Video size: ${video.videoWidth}x${video.videoHeight}`);
    
    let animationFrameId: number;
    
    const processFrame = () => {
      // Only draw when video is ready
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Make sure canvas dimensions match video
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          console.log(`Updated canvas size: ${canvas.width}x${canvas.height}`);
        }
        
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } else {
        console.log("Video not ready:", video.readyState);
      }
      
      animationFrameId = requestAnimationFrame(processFrame);
    };
    
    console.log("Starting animation frame loop");
    animationFrameId = requestAnimationFrame(processFrame);
    
    return () => {
      console.log("Cleaning up animation frame");
      cancelAnimationFrame(animationFrameId);
    };
  }, [isCameraActive]);
  
  /* 
  // WebSocket related code - commented out for testing
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const lastImageRef = useRef<ImageData | null>(null);
  const processingRef = useRef(false);
  
  // Connect to WebSocket server
  const connectWebSocket = () => {
    const ws = new WebSocket('ws://your-backend-url/ws');
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('WebSocket connection error');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.objects) {
          setDetectedObjects(data.objects);
        }
        processingRef.current = false;
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
        processingRef.current = false;
      }
    };
    
    wsRef.current = ws;
  };
  */
  
  return (
    <div className="flex flex-col items-center w-full h-full">
      <div className="relative w-full h-full overflow-hidden rounded-lg bg-gray-100">
        {error && (
          <div className="p-2 text-white bg-red-500 text-center">
            {error}
          </div>
        )}
        
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: 0 }}
        />
        
        <canvas 
          ref={canvasRef}
          className="w-full h-full object-cover"
        />
        
        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
          {!isCameraActive ? (
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
            >
              Start Camera
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="px-4 py-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
            >
              Stop Camera
            </button>
          )}
        </div>
        
        <div className="absolute top-4 left-4 bg-black/50 text-white px-2 py-1 rounded text-xs">
          {isCameraActive ? "Camera active" : "Camera inactive"}
        </div>
      </div>
    </div>
  );
}
