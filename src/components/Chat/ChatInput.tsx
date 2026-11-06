"use client";

import { useRef, useState } from "react";

type ChatInputProps = {
  placeholder?: string;
  disabled?: boolean;
  onSend: (message: string) => void;
  onPhotoUpload?: (file: File, slot: number) => Promise<string>;
};

export default function ChatInput({
  placeholder = "Type your message...",
  disabled = false,
  onSend,
  onPhotoUpload,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [uploadedPhotos, setUploadedPhotos] = useState<Array<{ path: string; name: string }>>([]);
  const [photoStatus, setPhotoStatus] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  async function uploadPhotos(files: FileList | null) {
    if (!files || !onPhotoUpload || disabled || photoBusy) return;
    const selected = Array.from(files);
    if (selected.length > 3 - uploadedPhotos.length) {
      setPhotoStatus("You can attach up to three photos.");
    } else {
      setPhotoStatus("");
    }
    const remaining = Math.max(0, 3 - uploadedPhotos.length);
    const accepted = selected.slice(0, remaining);
    setPhotoBusy(true);
    let next = [...uploadedPhotos];
    try {
      for (const file of accepted) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
          setPhotoStatus("Use a JPEG, PNG, or WebP photo up to 5 MB.");
          break;
        }
        setPhotoStatus(`Uploading photo ${next.length + 1} of 3…`);
        const path = await onPhotoUpload(file, next.length + 1);
        next = [...next, { path, name: file.name }];
        setUploadedPhotos(next);
      }
      if (next.length) setPhotoStatus(`${next.length} of 3 photos attached.`);
    } catch (error) {
      setPhotoStatus(error instanceof Error ? error.message : "Could not upload that photo. Try again.");
    } finally {
      setPhotoBusy(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  function send() {
    const text = message.trim();

    if (!text || disabled) return;

    onSend(text);
    setMessage("");
  }

  return (
    <div className="border-t border-slate-200/80 bg-white px-3 py-3 sm:px-4">
      {onPhotoUpload ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            ref={photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            aria-label="Choose up to three photos"
            onChange={(event) => void uploadPhotos(event.target.files)}
          />
          <button
            type="button"
            disabled={disabled || photoBusy || uploadedPhotos.length >= 3}
            onClick={() => photoInput.current?.click()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {photoBusy ? "Uploading…" : `Add photos (${uploadedPhotos.length}/3)`}
          </button>
          {uploadedPhotos.map((photo, index) => (
            <span key={photo.path} className="max-w-36 truncate rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600" title={photo.name}>
              Photo {index + 1} attached
            </span>
          ))}
          {photoStatus ? <span role="status" className="w-full text-xs text-slate-500">{photoStatus}</span> : null}
        </div>
      ) : null}
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/80 px-2 py-1.5 shadow-inner transition focus-within:border-blue-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
        <input
          value={message}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="button"
          onClick={send}
          disabled={disabled || !message.trim()}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M5 12h14" />
            <path d="M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      {onPhotoUpload ? (
        <p className="mt-1.5 px-3 text-[11px] text-slate-500">Max image size: 5 MB per image.</p>
      ) : null}
    </div>
  );
}
