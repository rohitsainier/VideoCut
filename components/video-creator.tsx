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

      // Add canvas to DOM temporarily if it doesn't exist
      const canvas = document.createElement('canvas');
      const { width, height } = dimensions[dimension];
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      // Set up MediaRecorder with proper options
      const stream = canvas.captureStream(30); // 30 fps
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: 2500000 // 2.5 Mbps
      });

      const chunks: Blob[] = [];
      let currentFrame = 0;
      const fps = 30;
      const frameDuration = 1000 / fps;
      const imageDisplayTime = 3000; // 3 seconds per image
      const transitionTime = 1000; // 1 second transition
      const totalFrames = images.length * ((imageDisplayTime + transitionTime) / frameDuration);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        try {
          let finalBlob = blob;
          if (audio) {
            finalBlob = await combineVideoWithAudio(blob, audio);
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
          setIsRendering(false);
        } catch (error) {
          console.error('Error creating video:', error);
          toast.error("Failed to create video");
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

        const currentImg = await loadImage(images[currentImageIndex]);
        ctx.clearRect(0, 0, width, height);

        if (timeInCycle < imageDisplayTime) {
          // Display current image
          ctx.globalAlpha = 1;
          drawImageCovered(ctx, currentImg, width, height);
        } else {
          // Transition to next image
          const nextImg = await loadImage(images[nextImageIndex]);
          const transitionProgress = (timeInCycle - imageDisplayTime) / transitionTime;

          switch (transition) {
            case 'fade':
              ctx.globalAlpha = 1;
              drawImageCovered(ctx, currentImg, width, height);
              ctx.globalAlpha = transitionProgress;
              drawImageCovered(ctx, nextImg, width, height);
              break;

            case 'slide':
              drawImageCovered(ctx, currentImg, width, height);
              ctx.save();
              ctx.translate(width * (1 - transitionProgress), 0);
              drawImageCovered(ctx, nextImg, width, height);
              ctx.restore();
              break;

            case 'zoom':
              const scale = 1 + (0.2 * (1 - transitionProgress));
              ctx.save();
              ctx.translate(width/2, height/2);
              ctx.scale(scale, scale);
              ctx.translate(-width/2, -height/2);
              drawImageCovered(ctx, nextImg, width, height);
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

  // Helper functions
  const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = URL.createObjectURL(file);
    });
  };

  const drawImageCovered = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, width: number, height: number) => {
    const scale = Math.max(width / img.width, height / img.height);
    const x = (width - img.width * scale) * 0.5;
    const y = (height - img.height * scale) * 0.5;
    ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
  };

  const combineVideoWithAudio = async (videoBlob: Blob, audioFile: File): Promise<Blob> => {
    const ffmpeg = new FFmpeg();
    await ffmpeg.load();

    try {
      // Write video and audio files to FFmpeg's virtual filesystem
      await ffmpeg.writeFile('video.webm', await fetchFile(videoBlob));
      await ffmpeg.writeFile('audio.mp3', await fetchFile(audioFile));

      // Run FFmpeg command to combine video and audio
      await ffmpeg.exec([
        '-i', 'video.webm',
        '-i', 'audio.mp3',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        'output.mp4'
      ]);

      // Read the output file
      const data = await ffmpeg.readFile('output.mp4');
      const finalBlob = new Blob([data], { type: 'video/mp4' });

      return finalBlob;
    } finally {
      // Clean up
      await ffmpeg.terminate();
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
                    <SelectItem value="zoom">Zoom</SelectItem>
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
  