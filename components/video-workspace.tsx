"use client";

import { useState } from "react";
import { VideoUpload } from "@/components/video-upload";
import { VideoEditor } from "@/components/video-editor";
import { VideoFile } from "@/types/video";

export function VideoWorkspace() {
  const [videoFile, setVideoFile] = useState<VideoFile | null>(null);

  return (
    <>
      {!videoFile ? (
        <VideoUpload onVideoSelect={setVideoFile} />
      ) : (
        <VideoEditor videoFile={videoFile} onReset={() => setVideoFile(null)} />
      )}
    </>
  );
}