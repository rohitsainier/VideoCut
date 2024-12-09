"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DimensionType, CreateVideoFile } from "@/types/video";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Music, Ratio, ArrowLeftRight as TransitionIcon, Play, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

interface VideoCreatorProps {
  onVideoCreate: (videoFile: CreateVideoFile) => void;
}


export function VideoCreator({ onVideoCreate }: VideoCreatorProps) {
  const [images, setImages] = useState<File[]>([]);
  const [audio, setAudio] = useState<File | null>(null);
  const [transition, setTransition] = useState<string>("fade");
  const [dimension, setDimension] = useState<DimensionType>("16:9");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const dimensions = {
    "16:9": { width: 1280, height: 720 },
    "9:16": { width: 720, height: 1280 },
    "1:1": { width: 720, height: 720 },
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setImages(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.every(file => file.type.startsWith('image/'))) {
      setImages(files);
    }
  };

  // Preview animation
  useEffect(() => {
    if (images.length === 0) return;
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
    }, 1000);
    return () => clearInterval(interval);
  }, [images.length]);

  const renderVideo = async () => {
    if (!images.length) return;

    try {
      setIsRendering(true);
      setRenderProgress(0);

      const canvas = document.createElement('canvas');
      const { width, height } = dimensions[dimension];
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false })!; // Disable alpha for better performance
      
      // Pre-load all images to prevent flickering
      const loadedImages = await Promise.all(images.map(loadImage));
      
      const stream = canvas.captureStream(30);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: 2500000
      });

      const chunks: Blob[] = [];
      let currentFrame = 0;
      const fps = 30;
      const frameDuration = 1000 / fps;
      const imageDisplayTime = 3000;
      const transitionTime = 500; // Increased for smoother transitions
      const totalFrames = images.length * ((imageDisplayTime + transitionTime) / frameDuration);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        try {
          let finalBlob = new Blob(chunks, { type: 'video/webm' });

          if (audio) {
            // Validate audio file
            if (!audio.type.startsWith('audio/')) {
              throw new Error('Invalid audio file format');
            }
            finalBlob = await combineVideoWithAudio(finalBlob, audio);
          }

          const videoFile = new File([finalBlob], 'rendered-video.webm', {
            type: 'video/webm',
            lastModified: Date.now()
          });

          const videoFileObject: CreateVideoFile = {
            file: videoFile,
            type: 'video/webm',
            name: 'rendered-video.webm',
            dimension,
            url: URL.createObjectURL(videoFile)
          };

          onVideoCreate(videoFileObject);
        } catch (error) {
          console.error('Error finalizing video:', error);
          toast.error(error instanceof Error ? error.message : "Failed to create video");
        } finally {
          setIsRendering(false);
        }
      };

      const renderFrame = async () => {
        if (currentFrame >= totalFrames) {
          mediaRecorder.stop();
          return;
        }

        const currentTime = currentFrame * frameDuration;
        const cycleTime = imageDisplayTime + transitionTime;
        const currentCycle = Math.floor(currentTime / cycleTime);
        const timeInCycle = currentTime % cycleTime;

        const currentImageIndex = currentCycle % images.length;
        const nextImageIndex = (currentCycle + 1) % images.length;

        // Use pre-loaded images
        const currentImg = loadedImages[currentImageIndex];
        const nextImg = loadedImages[nextImageIndex];

        // Clear with solid color instead of using clearRect
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        if (timeInCycle < imageDisplayTime) {
          // Display current image without transition
          ctx.globalAlpha = 1;
          drawImageCovered(ctx, currentImg, width, height);
        } else {
          // Apply transition with easing
          const transitionProgress = easeInOutCubic((timeInCycle - imageDisplayTime) / transitionTime);

          switch (transition) {
            case 'fade':
              // Draw both images with proper alpha
              drawImageCovered(ctx, currentImg, width, height);
              ctx.globalAlpha = transitionProgress;
              drawImageCovered(ctx, nextImg, width, height);
              break;

            case 'slide':
              // Use transform instead of translation for better performance
              ctx.save();
              drawImageCovered(ctx, currentImg, width, height);
              ctx.transform(1, 0, 0, 1, width * (1 - transitionProgress), 0);
              drawImageCovered(ctx, nextImg, width, height);
              ctx.restore();
              break;

            case 'verticalSlide':
              ctx.save();
              drawImageCovered(ctx, currentImg, width, height);
              ctx.transform(1, 0, 0, 1, 0, height * (1 - transitionProgress));
              drawImageCovered(ctx, nextImg, width, height);
              ctx.restore();
              break;

            case 'zoom':
              ctx.save();
              drawImageCovered(ctx, currentImg, width, height);
              const scale = 1 + (0.2 * transitionProgress);
              ctx.transform(scale, 0, 0, scale, width * (1 - scale) / 2, height * (1 - scale) / 2);
              ctx.globalAlpha = transitionProgress;
              drawImageCovered(ctx, nextImg, width, height);
              ctx.restore();
              break;

            case 'rotate':
              ctx.save();
              drawImageCovered(ctx, currentImg, width, height);
              const angle = Math.PI * 2 * transitionProgress;
              ctx.transform(
                Math.cos(angle), Math.sin(angle),
                -Math.sin(angle), Math.cos(angle),
                width / 2 * (1 - Math.cos(angle)) + height / 2 * Math.sin(angle),
                -width / 2 * Math.sin(angle) + height / 2 * (1 - Math.cos(angle))
              );
              ctx.globalAlpha = transitionProgress;
              drawImageCovered(ctx, nextImg, width, height);
              ctx.restore();
              break;

            case 'flip':
              ctx.save();
              const flipScale = Math.cos(Math.PI * transitionProgress);
              ctx.transform(flipScale, 0, 0, 1, width * (1 - flipScale) / 2, 0);
              if (flipScale < 0) {
                ctx.transform(-1, 0, 0, 1, width, 0);
                drawImageCovered(ctx, nextImg, width, height);
              } else {
                drawImageCovered(ctx, currentImg, width, height);
              }
              ctx.restore();
              break;
          }
        }

        currentFrame++;
        setRenderProgress((currentFrame / totalFrames) * 100);
        requestAnimationFrame(renderFrame);
      };

      mediaRecorder.start();
      renderFrame();

    } catch (error) {
      console.error('Error in renderVideo:', error);
      toast.error("Error rendering video");
      setIsRendering(false);
    }
  };

  // Improved helper functions
  const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`));
      img.src = URL.createObjectURL(file);
    });
  };

  const drawImageCovered = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    width: number,
    height: number
  ) => {
    const imgRatio = img.width / img.height;
    const canvasRatio = width / height;
    let renderWidth = width;
    let renderHeight = height;
    let offsetX = 0;
    let offsetY = 0;

    if (imgRatio > canvasRatio) {
      renderWidth = height * imgRatio;
      offsetX = -(renderWidth - width) / 2;
    } else {
      renderHeight = width / imgRatio;
      offsetY = -(renderHeight - height) / 2;
    }

    ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);
  };

  // Easing function for smoother transitions
  const easeInOutCubic = (t: number): number => {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  // Improved audio handling
  const combineVideoWithAudio = async (videoBlob: Blob, audioFile: File): Promise<Blob> => {
    const ffmpeg = new FFmpeg();
  
    try {
      await ffmpeg.load();
  
      ffmpeg.on('progress', ({ progress }) => {
        setRenderProgress(Math.min(100, Math.round(progress * 100)));
      });
  
      await ffmpeg.writeFile('video.webm', await fetchFile(videoBlob));
      await ffmpeg.writeFile('audio.mp3', await fetchFile(audioFile));
  
      // Extract video duration
      const videoInfo = await ffmpeg.exec(['-i', 'video.webm']);
      console.log("Video Info Output:", videoInfo);
  
      const durationMatch = videoInfo.toString().match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d+)/);
      if (!durationMatch) {
        console.warn('Duration not found in video info.');
      } else {
        const [, hours, minutes, seconds] = durationMatch;
        const durationInSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
        console.log("Video Duration (seconds):", durationInSeconds);
      }
  
      // Combine video and audio
      await ffmpeg.exec([
        '-i', 'video.webm',
        '-i', 'audio.mp3',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-b:a', '192k',
        'output.mp4'
      ]);
  
      const data = await ffmpeg.readFile('output.mp4');
      return new Blob([data], { type: 'video/mp4' });
  
    } catch (error) {
      console.error('FFmpeg error:', error);
      throw new Error('Failed to combine video and audio');
    } finally {
      ffmpeg.terminate();
    }
  };
  

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-6">
        <Card className="p-6">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">Media</h2>
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
                  isDragging ? "border-blue-500 bg-blue-50" : "border-gray-200",
                  images.length > 0 && "border-green-500 bg-green-50"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-500 mb-2">
                  {images.length > 0
                    ? `${images.length} images selected`
                    : "Drag & drop images or click to browse"}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="flex items-center gap-2 mb-2">
                  <Music className="w-4 h-4" />
                  Background Music
                </Label>
                <Input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setAudio(e.target.files?.[0] || null)}
                  className="cursor-pointer"
                />
              </div>

              <div>
                <Label className="flex items-center gap-2 mb-2">
                  <TransitionIcon className="w-4 h-4" />
                  Transition Style
                </Label>
                <Select value={transition} onValueChange={setTransition}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                  <SelectItem value="fade">Fade</SelectItem>
                    <SelectItem value="slide">Slide</SelectItem>
                    <SelectItem value="verticalSlide">Vertical Slide</SelectItem>
                    <SelectItem value="zoom">Zoom</SelectItem>
                    <SelectItem value="rotate">Rotate</SelectItem>
                    <SelectItem value="flip">Flip</SelectItem>
                  </SelectContent>

                </Select>
              </div>

              <div>
                <Label className="flex items-center gap-2 mb-2">
                  <Ratio className="w-4 h-4" />
                  Video Dimension
                </Label>
                <Select value={dimension} onValueChange={(value: DimensionType) => setDimension(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">16:9 Landscape</SelectItem>
                    <SelectItem value="9:16">9:16 Portrait</SelectItem>
                    <SelectItem value="1:1">1:1 Square</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </Card>

        <Button 
          onClick={renderVideo}
          className="w-full"
          disabled={images.length === 0 || isRendering}
        >
          {isRendering ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Rendering Video...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Render Video
            </>
          )}
        </Button>

        {isRendering && (
          <Progress value={renderProgress} className="w-full" />
        )}
      </div>

      <div className="lg:col-span-2">
        <Card className="h-full p-6">
          <h2 className="text-xl font-semibold mb-4">Preview</h2>
          <div className="flex flex-col items-center justify-center h-[calc(100%-2rem)]">
            {images.length > 0 ? (
              <div
                ref={previewRef}
                className="relative overflow-hidden rounded-lg shadow-lg"
                style={{
                  width: `${dimensions[dimension].width}px`,
                  height: `${dimensions[dimension].height}px`,
                  maxWidth: '100%',
                  maxHeight: '100%',
                  aspectRatio: dimension.split(':').join('/'),
                }}
              >
                <img
                  src={URL.createObjectURL(images[currentImageIndex])}
                  alt="Preview"
                  className="object-cover w-full h-full"
                />
              </div>
            ) : (
              <p className="text-gray-400">No images selected for preview</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
  