'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface DetectedObject {
  label: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export default function Camera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDetections, setShowDetections] = useState(true);
  
  // Frame processing control
  const lastFrameTimeRef = useRef<number>(0);
  const processingThrottleMs = 1000; // Send at most one frame per second
  
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
              
              // Connect to WebSocket when camera starts
              connectWebSocket();
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
      
      // Disconnect WebSocket when camera stops
      disconnectWebSocket();
    }
  };
  
  // Connect to WebSocket server
  const connectWebSocket = () => {
    try {
      // Use your backend URL here
      const socket = io('http://localhost:5000', {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
      
      socket.on('connect', () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
      });
      
      socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
      });
      
      socket.on('connect_error', (err: any) => {
        console.error('WebSocket connection error:', err);
        setError(`WebSocket error: ${err.message}`);
      });
      
      socket.on('detection_result', (data: any) => {
        if (data.objects) {
          setDetectedObjects(data.objects);
          console.log('Received detection results:', data.objects);
        }
        setIsProcessing(false);
      });
      
      socket.on('error', (data: any) => {
        console.error('Server error:', data.message);
        setError(`Server error: ${data.message}`);
        setIsProcessing(false);
      });
      
      socket.on('status', (data: any) => {
        console.log('Status update:', data.status);
        if (data.status === 'throttled') {
          setIsProcessing(false);
        }
      });
      
      socketRef.current = socket;
    } catch (err) {
      console.error('Error creating WebSocket:', err);
      setError(`WebSocket initialization error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  
  // Disconnect WebSocket
  const disconnectWebSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  };
  
  // Process and draw video frames
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
        
        // Draw detected objects if available
        if (showDetections && detectedObjects.length > 0) {
          drawDetectedObjects(ctx, detectedObjects);
        }
        
        // Check if we should send a frame for processing
        const now = Date.now();
        if (isConnected && !isProcessing && (now - lastFrameTimeRef.current > processingThrottleMs)) {
          sendFrameForProcessing(canvas);
          lastFrameTimeRef.current = now;
        }
      }
      
      animationFrameId = requestAnimationFrame(processFrame);
    };
    
    animationFrameId = requestAnimationFrame(processFrame);
    
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isCameraActive, isConnected, isProcessing, detectedObjects, showDetections]);
  
  // Draw detected objects on canvas
  const drawDetectedObjects = (ctx: CanvasRenderingContext2D, objects: DetectedObject[]) => {
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    
    objects.forEach(obj => {
      // Get normalized coordinates
      const { x, y, width, height } = obj.bbox;
      
      // Convert to canvas coordinates
      const boxX = x * canvasWidth;
      const boxY = y * canvasHeight;
      const boxWidth = width * canvasWidth;
      const boxHeight = height * canvasHeight;
      
      // Draw bounding box
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 2;
      ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
      
      // Draw label background
      const label = `${obj.label} (${Math.round(obj.confidence * 100)}%)`;
      ctx.font = '14px Arial';
      const textMetrics = ctx.measureText(label);
      const textHeight = 20;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(boxX, boxY - textHeight, textMetrics.width + 10, textHeight);
      
      // Draw label text
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, boxX + 5, boxY - 5);
    });
  };
  
  // Send a frame to the backend for processing
  const sendFrameForProcessing = (canvas: HTMLCanvasElement) => {
    if (!socketRef.current || !socketRef.current.connected) return;
    
    try {
      setIsProcessing(true);
      
      // Compress the image before sending
      const imageData = canvas.toDataURL('image/jpeg', 0.7); // 70% quality
      
      // Send via WebSocket
      socketRef.current.emit('frame', { data: imageData });
    } catch (err) {
      console.error('Error sending frame:', err);
      setIsProcessing(false);
    }
  };
  
  // Toggle detection visibility
  const toggleDetections = () => {
    setShowDetections(!showDetections);
  };
  
  return (
    <div className="flex flex-col items-center w-full h-full">
      <div className="relative w-full h-full overflow-hidden rounded-lg bg-gray-100">
        {error && (
          <div className="absolute top-0 left-0 right-0 p-2 text-white bg-red-500 text-center z-10">
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
        
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
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
          
          {isCameraActive && (
            <button
              onClick={toggleDetections}
              className={`px-4 py-2 ${showDetections ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-500 hover:bg-gray-600'} text-white rounded-full transition-colors`}
            >
              {showDetections ? 'Hide Detections' : 'Show Detections'}
            </button>
          )}
        </div>
        
        <div className="absolute top-4 right-4 flex flex-col gap-1">
          <div className={`px-2 py-1 rounded text-xs ${isConnected ? 'bg-green-500' : 'bg-red-500'} text-white`}>
            {isConnected ? "Connected" : "Disconnected"}
          </div>
          
          {isProcessing && (
            <div className="px-2 py-1 bg-blue-500 rounded text-xs text-white">
              Processing...
            </div>
          )}
          
          <div className="px-2 py-1 bg-black/50 rounded text-xs text-white">
            {detectedObjects.length} objects detected
          </div>
        </div>
      </div>
    </div>
  );
}
