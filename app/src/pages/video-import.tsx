import { useState, useCallback, useEffect, useRef } from "react";
import { SettingsLayout } from '@/components/settings-layout';
import { apiClient } from "@/lib/apiClient";

interface ImportJob {
  session_id: string;
  title: string;
  status: string;
  stage: string;
  progress: number;
  video_filename: string;
  video_size_bytes: number;
  has_guide: boolean;
  created_at: string;
  error?: string;
}

const STAGE_LABELS: Record<string, string> = {
  uploading: "Uploading...",
  queued: "Queued",
  extracting_audio: "Extracting audio...",
  transcribing: "Transcribing speech...",
  extracting_frames: "Detecting scene changes...",
  analyzing: "Identifying steps...",
  generating: "Generating guide...",
  done: "Complete",
  failed: "Failed",
};

export default function VideoImportPage() {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const fetchJobs = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/video-import/list");
      setJobs(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchJobs();
    pollRef.current = setInterval(fetchJobs, 3000);
    return () => clearInterval(pollRef.current);
  }, [fetchJobs]);

  useEffect(() => {
    const hasActive = jobs.some(
      (j) => !["done", "failed", "completed"].includes(j.stage || j.status)
    );
    if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
    }
  }, [jobs]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name.replace(/\.[^.]+$/, ""));

    try {
      await apiClient.post("/video-import/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        },
      });
      setUploading(false);
      setUploadProgress(0);
      fetchJobs();
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(fetchJobs, 3000);
    } catch {
      setUploading(false);
      alert("Upload failed");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });

  return (
    <SettingsLayout title="Video → Guide" description="Upload a screen recording and get a step-by-step guide with screenshots.">

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-primary bg-primary/5 dark:bg-indigo-950"
            : "border-gray-300 dark:border-gray-700 hover:border-gray-400"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? (
          <div>
            <div className="text-lg mb-2">Uploading... {uploadProgress}%</div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 max-w-md mx-auto">
              <div
                className="bg-primary h-3 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-3">🎬</div>
            <div className="text-lg font-medium">
              Drop a video here or click to browse
            </div>
            <div className="text-sm text-gray-500 mt-1">
              MP4, MOV, AVI, MKV, WebM — up to 2 GB
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp4,.mov,.avi,.mkv,.webm,.m4v"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
      </div>

      {/* Jobs list */}
      {jobs.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold mb-4">Imports</h2>
          <div className="space-y-3">
            {jobs.map((job) => (
              <div
                key={job.session_id}
                className="border dark:border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">{job.title}</div>
                  <div className="text-sm text-gray-500">
                    {formatSize(job.video_size_bytes)} •{" "}
                    {formatDate(job.created_at)}
                  </div>
                </div>

                {job.stage === "failed" ? (
                  <div className="text-red-500 text-sm">
                    ❌ {job.error || "Processing failed"}
                  </div>
                ) : job.stage === "done" || job.has_guide ? (
                  <div className="flex items-center justify-between">
                    <span className="text-green-500 text-sm">
                      ✅ Guide ready
                    </span>
                    <a
                      href={`/workflow/${job.session_id}`}
                      className="text-primary hover:underline text-sm"
                    >
                      View guide →
                    </a>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>{STAGE_LABELS[job.stage] || job.stage}</span>
                      <span>{job.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-500"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </SettingsLayout>
  );
}
