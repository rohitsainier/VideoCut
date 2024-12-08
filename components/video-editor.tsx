"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { VideoFile } from "@/types/video";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Scissors,
  Volume2,
  VolumeX,
  Check,
  X
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

interface VideoEditorProps {
  videoFile: VideoFile;
  onReset: () => void;
}

export function VideoEditor({ videoFile, onReset }: VideoEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [trimDialogOpen, setTrimDialogOpen] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isTrimming, setIsTrimming] = useState(false);
  const [trimProgress, setTrimProgress] = useState(0);

  useEffect(() => {
    // Initialize audio context on first user interaction
    const handleFirstInteraction = () => {
      const audioContext = new AudioContext();
      audioContext.resume().then(() => {
        document.removeEventListener('click', handleFirstInteraction);
      });
    };

    document.addEventListener('click', handleFirstInteraction);
    return () => document.removeEventListener('click', handleFirstInteraction);
  }, []);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (value: number[]) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    if (videoRef.current) {
      videoRef.current.volume = value[0];
      setVolume(value[0]);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleTrimOpen = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const validEnd = isFinite(video.duration) ? video.duration : 0;
      setTrimStart(0);
      setTrimEnd(validEnd);
      setTrimDialogOpen(true);
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleTrimConfirm = async () => {
    if (!videoRef.current) return;
  
    try {
      setIsTrimming(true);
      setTrimProgress(0);
  
      const video = videoRef.current;
      
      // Validate trim values and video state
      if (!isFinite(trimStart) || 
          !isFinite(trimEnd) || 
          trimStart >= trimEnd || 
          !isFinite(video.duration)) {
        throw new Error('Invalid trim values or video state');
      }
  
      // Calculate duration
      const duration = trimEnd - trimStart;
      
      // Create media recorder
      const stream = (video as any).captureStream() as MediaStream;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8,opus'
      });
  
      const chunks: Blob[] = [];
      
      // Record chunks as they become available
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };
  
      // Promise to handle the trimming process
      await new Promise<void>((resolve, reject) => {
        // Handle recording completion
        mediaRecorder.onstop = async () => {
          try {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            
            // Update video source
            video.src = url;
            
            // Clean up old URL if it exists
            if (video.dataset.trimmedUrl) {
              URL.revokeObjectURL(video.dataset.trimmedUrl);
            }
            
            // Store new URL for future cleanup
            video.dataset.trimmedUrl = url;
            video.currentTime = 0;
            setCurrentTime(0);
            setDuration(duration);

            resolve();
          } catch (error) {
            reject(error);
          }
        };
  
        // Handle recording errors
        mediaRecorder.onerror = (event: Event) => {
          const error = (event as ErrorEvent).message;
          reject(new Error('MediaRecorder error: ' + error));
        };
  
        // Start recording process
        const startRecording = () => {
          video.play();
          mediaRecorder.start();
        };
  
        // Stop recording process
        const stopRecording = () => {
          video.pause();
          mediaRecorder.stop();
          stream.getTracks().forEach(track => track.stop());
        };
  
        // Update progress
        const updateProgress = () => {
          if (video.currentTime >= trimEnd) {
            stopRecording();
            return;
          }
  
          const progress = ((video.currentTime - trimStart) / duration) * 100;
          setTrimProgress(Math.round(Math.min(100, Math.max(0, progress))));
          
          if (video.currentTime < trimEnd) {
            requestAnimationFrame(updateProgress);
          }
        };
  
        // Set up video event handlers
        video.ontimeupdate = () => {
          if (video.currentTime >= trimEnd) {
            stopRecording();
          }
        };
  
        // Start the trimming process
        video.currentTime = trimStart;
        video.oncanplay = () => {
          video.oncanplay = null;
          startRecording();
          updateProgress();
        };
      });
  
      // Clean up and finalize
      setTrimDialogOpen(false);
      setIsTrimming(false);
      setTrimProgress(100);
  
    } catch (error) {
      console.error('Error during video trim:', error);
      setIsTrimming(false);
      setTrimProgress(0);
      setTrimDialogOpen(false);
      throw error;
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={videoFile.url}
          className="w-full h-full" 
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={toggleMute}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>

          <div className="flex-1 mx-4">
            <Slider
              value={[currentTime]}
              min={0}
              max={duration}
              step={0.1}
              onValueChange={handleSeek}
            />
          </div>

          <span className="text-sm text-muted-foreground w-20 text-right">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-muted-foreground" />
          <Slider
            className="w-32"
            value={[volume]}
            min={0}
            max={1}
            step={0.1}
            onValueChange={handleVolumeChange}
          />
        </div>

        <div className="flex justify-between">
          <div className="space-x-2">
            <Button 
              variant="secondary" 
              size="sm"
              onClick={handleTrimOpen}
            >
              <Scissors className="h-4 w-4 mr-2" />
              Trim
            </Button>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm"
            onClick={onReset}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Upload New Video
          </Button>
        </div>
      </div>

      <Dialog open={trimDialogOpen} onOpenChange={setTrimDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trim Video</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Trim Range</label>
              <Slider
                value={[trimStart, trimEnd]}
                min={0}
                max={duration}
                step={0.1}
                onValueChange={(values) => {
                  setTrimStart(values[0]);
                  setTrimEnd(values[1]);
                }}
              />
            </div>
            
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{formatTime(trimStart)}</span>
              <span>{formatTime(trimEnd)}</span>
            </div>

            {isTrimming && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Processing video...</span>
                  <span>{trimProgress}%</span>
                </div>
                <Progress value={trimProgress} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTrimDialogOpen(false)}
              disabled={isTrimming}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleTrimConfirm}
              disabled={isTrimming}
            >
              {isTrimming ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Trimming...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Apply Trim
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}