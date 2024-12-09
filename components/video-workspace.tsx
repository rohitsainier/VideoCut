"use client";

import { useState } from "react";
import { VideoUpload } from "@/components/video-upload";
import { VideoEditor } from "@/components/video-editor";
import { VideoCreator } from "@/components/video-creator";
import { EditVideoFile } from "@/types/video";
import { Button } from "@/components/ui/button";
import { Clapperboard, Plus, Video, ArrowLeft } from "lucide-react";

export function VideoWorkspace() {
  const [videoFile, setVideoFile] = useState<EditVideoFile | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleVideoCreate = (file: EditVideoFile) => {
    setVideoFile(file);
    setIsCreating(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="h-screen flex flex-col">
        {/* Header */}
        <div className="border-b bg-white shadow-sm">
          <div className="px-6 py-4 flex items-center justify-between max-w-[1920px] mx-auto w-full">
            <div className="flex items-center gap-2">
              <Clapperboard className="w-6 h-6 text-blue-500" />
              <h1 className="text-2xl font-semibold text-gray-800">Video Studio</h1>
            </div>
            {videoFile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVideoFile(null)}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Start
              </Button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="h-full max-w-[1920px] mx-auto p-6">
            {!videoFile ? (
              isCreating ? (
                <VideoCreator onVideoCreate={handleVideoCreate} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center space-y-6">
                  <VideoUpload onVideoSelect={setVideoFile} />
                  <Button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-2"
                    size="lg"
                  >
                    <Plus className="w-4 h-4" />
                    Create New Reel
                  </Button>
                </div>
              )
            ) : (
              <VideoEditor videoFile={videoFile} onReset={() => setVideoFile(null)} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}