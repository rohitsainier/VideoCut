"use client";

import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { EditVideoFile } from "@/types/video";

interface VideoUploadProps {
  onVideoSelect: (file: EditVideoFile) => void;
}

export function VideoUpload({ onVideoSelect }: VideoUploadProps) {
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file",
        variant: "destructive",
      });
      return;
    }

    const videoUrl = URL.createObjectURL(file);
    onVideoSelect({ file, url: videoUrl });
  };

  return (
    <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-12">
      <Upload className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-xl font-semibold mb-2">Upload your video</h2>
      <p className="text-muted-foreground mb-4">Drag and drop or click to select</p>
      <Button variant="secondary" className="relative">
        Select Video
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          accept="video/*"
          onChange={handleFileChange}
        />
      </Button>
    </div>
  );
}