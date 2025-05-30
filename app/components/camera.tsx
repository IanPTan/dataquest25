'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import './camera.css';

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

// Add this at the top of your file, before your component
declare global {
  interface Window {
    currentProcessingTimeout: NodeJS.Timeout | null;
  }
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
  const [animating, setAnimating] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Frame processing control
  const lastFrameTimeRef = useRef<number>(0);
  const processingThrottleMs = 1000; // Send at most one frame per second
  
  // Add this ref to store the timeout
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Start camera feed with animation
  const startCamera = async () => {
    if (animating) return;
    
    setAnimating(true);
    
    // Start eye opening animation
    const eyeElement = document.getElementById('camera-eye');
    if (eyeElement) {
      eyeElement.classList.add('opening');
      
      // Wait for animation to complete before actually activating camera
      setTimeout(async () => {
        try {
          // Check if MediaDevices API is available
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setError("Camera API not available in your browser. Try using a modern browser or ensure you're using HTTPS.");
            console.error("MediaDevices API not available");
            setAnimating(false);
            return;
          }

          // Set constraints with better mobile compatibility
          const constraints = {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          };
          
          console.log("Requesting camera access...");
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          console.log("Camera access granted", stream);
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
              console.log("Video metadata loaded");
              videoRef.current!.play()
                .then(() => {
                  setIsCameraActive(true);
                  setError(null);
                  console.log("Camera started successfully");
                  
                  // Connect to WebSocket when camera starts
                  connectWebSocket();
                  
                  // Add small delay before removing the animation state
                  // This ensures the eyelids are fully open before setting animating to false
                  setTimeout(() => {
                    setAnimating(false);
                  }, 100);
                })
                .catch(err => {
                  setError("Failed to play video: " + err.message);
                  console.error("Failed to play video:", err);
                  setAnimating(false);
                });
            };
          }
        } catch (err) {
          console.error('Camera access error:', err);
          
          // More specific error messages based on the error type
          if (err instanceof DOMException) {
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
              setError('Camera access denied. Please allow camera access and try again.');
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
              setError('No camera found on your device.');
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
              setError('Camera is already in use by another application.');
            } else if (err.name === 'OverconstrainedError') {
              setError('Camera cannot satisfy the requested constraints. Try a different camera.');
            } else if (err.name === 'TypeError' || err.name === 'SecurityError') {
              setError('Camera access not allowed. Make sure you are using HTTPS.');
            } else {
              setError('Could not access camera: ' + err.name);
            }
          } else {
            setError('Could not access camera: ' + (err instanceof Error ? err.message : String(err)));
          }
          setAnimating(false);
        }
      }, 800); // Eye opening animation takes about 800ms
    }
  };
  
  // Stop camera feed with animation
  const stopCamera = () => {
    if (animating) return;
    
    setAnimating(true);
    
    // Start eye closing animation
    const eyeElement = document.getElementById('camera-eye');
    if (eyeElement) {
      eyeElement.classList.remove('opening');
      eyeElement.classList.add('closing');
      
      // Wait for animation to complete before actually stopping camera
      setTimeout(() => {
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
          
          // Keep animation state active slightly longer to ensure eyelids close completely
          setTimeout(() => {
            eyeElement.classList.remove('closing');
            setAnimating(false);
          }, 100);
        }
      }, 700); // Give a little time for the animation to be visible before stopping
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
        console.log('Detection result received:', data);
        
        // Clear the processing timeout
        if (processingTimeoutRef.current) {
          clearTimeout(processingTimeoutRef.current);
          processingTimeoutRef.current = null;
        }
        
        if (data?.objects) {
          console.log('Number of objects detected:', data.objects.length);
          
          // Only update detections if they're different from current ones
          if (!areDetectionsSimilar(detectedObjects, data.objects)) {
            setDetectedObjects(data.objects);
          } else {
            console.log('Detections similar to previous, not updating UI');
          }
          
          // Check if audio data was received
          if (data.audio && data.audio.data) {
            console.log('Received audio data:', data.audio.text);
            playAudio(data.audio.data, data.audio.format || 'mp3');
          }
        } else {
          console.error('No objects field in detection result:', data);
          // Only clear if we had objects before
          if (detectedObjects.length > 0) {
            setDetectedObjects([]);
          }
        }
        
        setIsProcessing(false);
      });
      
      socket.on('status', (data: any) => {
        console.log('Status update:', data.status);
        if (data.status === 'throttled') {
          setIsProcessing(false);
        }
      });
      
      socket.on('error', (data: any) => {
        console.error('Server error:', data.message);
        setError(data.message);
        setIsProcessing(false);
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
  
  // First, add the missing ref at the top of your component
  const animationFrameRef = useRef<number | null>(null);
  
  // Then fix the animation frame effect to match our existing code
  useEffect(() => {
    if (isCameraActive && videoRef.current && canvasRef.current) {
      const drawFrame = () => {
        if (!videoRef.current || !canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) return;
        
        // Set canvas dimensions to match video
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Draw bounding boxes if available and enabled
        if (showDetections && detectedObjects.length > 0) {
          drawDetectedObjects(ctx, detectedObjects);
        }
        
        // Send frame for processing if connected and not already processing
        const now = Date.now();
        if (isConnected && !isProcessing && (now - lastFrameTimeRef.current > processingThrottleMs)) {
          // Note: This will clear detections as the new frame is sent
          sendFrame();
          lastFrameTimeRef.current = now;
        }
        
        // Continue animation loop
        animationFrameRef.current = requestAnimationFrame(drawFrame);
      };
      
      // Start the animation loop
      animationFrameRef.current = requestAnimationFrame(drawFrame);
      
      // Clean up
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [isCameraActive, isConnected, isProcessing, showDetections, detectedObjects]);
  
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
  const sendFrame = () => {
    if (!videoRef.current || !canvasRef.current || !socketRef.current || isProcessing) {
      return;
    }
    
    // Add a timeout to prevent getting stuck
    const timeout = setTimeout(() => {
      console.warn("Processing timeout triggered - UI unblocked");
      setIsProcessing(false);
      setError("Processing timed out. Server might be slow or unresponsive.");
      processingTimeoutRef.current = null;
    }, 15000); // 15 seconds timeout
    
    // Store the timeout in the ref
    processingTimeoutRef.current = timeout;
    
    console.log("Setting isProcessing = true");
    setIsProcessing(true);
    setError(null);
    
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.error("Canvas context not available");
        if (processingTimeoutRef.current) {
          clearTimeout(processingTimeoutRef.current);
          processingTimeoutRef.current = null;
        }
        setIsProcessing(false);
        return;
      }
      
      const frameId = `${Date.now().toString().slice(-6)}`;
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      
      console.log(`Sending frame ${frameId}`);
      
      // Send the frame
      socketRef.current.emit('frame', {
        data: imageData,
        frame_id: frameId
      });
      
    } catch (err) {
      console.error("Error sending frame:", err);
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      setIsProcessing(false);
      setError("Client error sending frame.");
    }
  };
  
  // Toggle detection visibility
  const toggleDetections = () => {
    setShowDetections(!showDetections);
  };
  
  // Add this function to play audio when received
  const playAudio = (audioBase64: string, format: string = 'mp3') => {
    try {
      // Create audio data URL
      const contentType = format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
      const audioUrl = `data:${contentType};base64,${audioBase64}`;
      
      console.log(`Playing audio (${format}, ${audioBase64.length} bytes)`);
      
      // Create and play audio element
      const audio = new Audio(audioUrl);
      
      audio.oncanplay = () => {
        console.log('Audio ready to play');
        audio.play()
          .then(() => {
            console.log('Audio playing');
            setIsPlaying(true);
          })
          .catch(err => {
            console.error('Error playing audio:', err);
          });
      };
      
      audio.onended = () => {
        console.log('Audio playback ended');
        setIsPlaying(false);
      };
      
      audio.onerror = (e) => {
        console.error('Audio error:', e);
      };
      
      // Store the URL for potential reuse
      setAudioSrc(audioUrl);
      
    } catch (err) {
      console.error('Error setting up audio:', err);
    }
  };
  
  // Add cleanup in useEffect
  useEffect(() => {
    return () => {
      // Clean up timeout on unmount
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    };
  }, []);
  
  // Add this function to compare detections
  const areDetectionsSimilar = (prev: DetectedObject[], curr: DetectedObject[], threshold = 0.1) => {
    // If counts are different, they're not similar
    if (prev.length !== curr.length) return false;
    
    // If no objects, they're similar (both empty)
    if (prev.length === 0) return true;
    
    // Check each object
    for (let i = 0; i < prev.length; i++) {
      const prevObj = prev[i];
      
      // Find matching object in current detections
      const matchingObj = curr.find(obj => obj.label === prevObj.label);
      
      // If no matching object with same label, not similar
      if (!matchingObj) return false;
      
      // Check if bounding box has moved significantly
      const xDiff = Math.abs(prevObj.bbox.x - matchingObj.bbox.x);
      const yDiff = Math.abs(prevObj.bbox.y - matchingObj.bbox.y);
      const widthDiff = Math.abs(prevObj.bbox.width - matchingObj.bbox.width);
      const heightDiff = Math.abs(prevObj.bbox.height - matchingObj.bbox.height);
      
      // If any dimension changed more than threshold, not similar
      if (xDiff > threshold || yDiff > threshold || 
          widthDiff > threshold || heightDiff > threshold) {
        return false;
      }
    }
    
    // All objects are similar
    return true;
  };
  
  return (
    <div className="flex flex-col items-center w-full h-full">
      <div className="relative w-full h-full overflow-hidden rounded-lg bg-black">
        {error && (
          <div className="absolute top-0 left-0 right-0 p-1 text-white bg-red-500 text-center z-10 text-sm">
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
          className="w-full h-full object-contain"
        />
        
        {/* Fullscreen eye animation */}
        <div 
          id="camera-eye" 
          className={`absolute inset-0 z-20 ${isCameraActive ? 'opacity-100' : 'opacity-100'}`}
          style={{ pointerEvents: isCameraActive ? 'none' : 'auto' }}
        >
          <div className="eye-container">
            <div className="eye-lid top-lid">
              <div className="lid-pattern"></div>
              <div className="lid-edge"></div>
            </div>
            <div className="eye-lid bottom-lid">
              <div className="lid-pattern"></div>
              <div className="lid-edge"></div>
            </div>
          </div>
        </div>
        
        {/* Center button when camera is inactive */}
        {!isCameraActive && !animating && (
          <div className="absolute inset-0 flex items-center justify-center z-30">
            <button
              onClick={startCamera}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full 
                         hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg
                         transform hover:scale-105 hover:shadow-xl text-lg font-semibold flex items-center gap-2"
              disabled={animating}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              Open Eyes
            </button>
          </div>
        )}
        
        {/* Bottom controls when camera is active */}
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2 z-30">
          {isCameraActive && !animating && (
            <>
              <button
                onClick={stopCamera}
                className="px-4 py-2 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-full 
                          hover:from-red-600 hover:to-pink-700 transition-all duration-300 shadow-lg
                          transform hover:scale-105 hover:shadow-xl text-sm font-semibold flex items-center gap-2"
                disabled={animating}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
                  <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"></path>
                  <path d="M1 1l22 22"></path>
                </svg>
                Close Eyes
              </button>
              
              <button
                onClick={toggleDetections}
                className={`px-4 py-2 text-white rounded-full shadow-lg transition-all duration-300
                            transform hover:scale-105 hover:shadow-xl text-sm font-semibold flex items-center gap-2
                            ${showDetections 
                              ? 'bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700' 
                              : 'bg-gradient-to-r from-gray-500 to-slate-600 hover:from-gray-600 hover:to-slate-700'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                </svg>
                {showDetections ? 'Hide Objects' : 'Show Objects'}
              </button>
            </>
          )}
        </div>
        
        {/* Status indicators */}
        {isCameraActive && (
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            <div className={`px-2 py-0.5 rounded text-xs ${isConnected ? 'bg-green-500' : 'bg-red-500'} text-white`}>
              {isConnected ? "Connected" : "Disconnected"}
            </div>
            
            {isProcessing && (
              <div className="px-2 py-0.5 bg-blue-500 rounded text-xs text-white">
                Processing...
              </div>
            )}
            
            <div className="px-2 py-0.5 bg-black/50 rounded text-xs text-white">
              {detectedObjects.length} objects
            </div>
          </div>
        )}
        
        {/* Loading spinner during animation */}
        {animating && (
          <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/30">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </div>
  );
}
