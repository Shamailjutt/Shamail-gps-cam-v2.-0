import { useState } from 'react';
import {
  Download,
  Share2,
  Trash2,
  X,
  Camera,
  CheckCircle2,
  CalendarClock,
  ImagePlus,
} from 'lucide-react';
import { CapturedPhoto } from '../types';
import { triggerPhotoDownload } from '../utils/photoDb';

interface GalleryViewProps {
  photos: CapturedPhoto[];
  onDelete: (id: string) => void;
  onEditPhoto: (photo: CapturedPhoto) => void;
  onOpenGalleryGps: () => void;
  onReturnToCamera: () => void;
}

export function GalleryView({
  photos,
  onDelete,
  onEditPhoto,
  onOpenGalleryGps,
  onReturnToCamera,
}: GalleryViewProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<CapturedPhoto | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const handleSharePhoto = async (photo: CapturedPhoto) => {
    try {
      const response = await fetch(photo.dataUrl);
      const blob = await response.blob();
      const file = new File([blob], photo.fileName, { type: 'image/jpeg' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: photo.fileName,
          text: `${photo.organizationName} · ${photo.locationHeadline}`,
          files: [file],
        });
        return;
      }
    } catch {
      // Fall back to direct file download when Web Share API is unavailable
    }
    triggerPhotoDownload(photo);
    setShareFeedback(`Saved ${photo.fileName} to Downloads`);
    setTimeout(() => setShareFeedback(null), 3000);
  };

  if (photos.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-6 text-center bg-[#14171F] border border-[#2B3142] rounded-2xl">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
          <Camera className="w-6 h-6 text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-100">No Stamped GPS Photos Yet</h2>
        <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
          Capture a live camera photo or use <strong>Gallery GPS Camera</strong> to stamp any
          existing gallery photo with SHAMAIL PERA location, coordinates, and date/time.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onReturnToCamera}
            className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-sm font-bold transition-colors cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            Open Camera Viewfinder
          </button>
          <button
            type="button"
            onClick={onOpenGalleryGps}
            className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl border border-amber-500/60 hover:bg-amber-500/15 text-amber-300 text-sm font-semibold transition-colors cursor-pointer"
          >
            <ImagePlus className="w-4 h-4" />
            Gallery GPS Camera
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2B3142] pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">GPS Photo Gallery</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
            <span className="font-mono tabular-nums">{photos.length} photo(s)</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-amber-300">Pictures/GpsCamByShamail</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {shareFeedback && <span className="text-xs text-emerald-400">{shareFeedback}</span>}
          <button
            type="button"
            onClick={onOpenGalleryGps}
            className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors cursor-pointer"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            Gallery GPS Camera
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="bg-[#14171F] border border-[#2B3142] rounded-2xl overflow-hidden flex flex-col"
          >
            <button
              type="button"
              onClick={() => setSelectedPhoto(photo)}
              className="relative aspect-video bg-[#07080B] overflow-hidden group cursor-pointer focus:outline-none"
            >
              <img
                src={photo.dataUrl}
                alt={photo.locationHeadline}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
              />
            </button>

            <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-100 truncate">
                  {photo.locationHeadline}
                </p>
                <p className="text-xs font-mono tabular-nums text-slate-400 truncate">
                  {photo.displayedTimestampText}
                </p>
                <div className="flex items-center gap-1.5 text-xs pt-0.5 text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>
                    {photo.isGalleryExport
                      ? 'Gallery GPS Export'
                      : photo.isEditedTimestamp
                        ? 'Custom Display Timestamp'
                        : 'Live Capture Timestamp'}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-[#2B3142]">
                <button
                  type="button"
                  onClick={() => onEditPhoto(photo)}
                  className="w-full inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-amber-500/50 hover:bg-amber-500/15 text-amber-300 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  Customize Stamp
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => triggerPhotoDownload(photo)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Save JPEG
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSharePhoto(photo)}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-[#2B3142] hover:bg-[#1B1F2B] text-slate-200 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5 text-amber-400" />
                    Share
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(photo.id)}
                    aria-label={`Delete ${photo.fileName}`}
                    className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-lg border border-[#2B3142] hover:border-red-500/50 hover:bg-red-500/10 text-red-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Full-Resolution Lightbox Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D0F14] border border-[#2B3142] rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-[#2B3142] bg-[#14171F]">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-100 truncate">
                  {selectedPhoto.fileName}
                </h3>
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                  <span>
                    {selectedPhoto.width} × {selectedPhoto.height}px
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedPhoto.organizationName}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                aria-label="Close photo viewer"
                className="min-h-[40px] min-w-[40px] rounded-lg border border-[#2B3142] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-[#07080B] p-4 flex items-center justify-center">
              <img
                src={selectedPhoto.dataUrl}
                alt={selectedPhoto.fileName}
                referrerPolicy="no-referrer"
                className="max-h-[68vh] w-auto object-contain rounded-lg"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-[#2B3142] bg-[#14171F]">
              <span className="text-xs font-mono tabular-nums text-slate-300">
                {selectedPhoto.coordinatesText}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedPhoto;
                    setSelectedPhoto(null);
                    onEditPhoto(target);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg border border-amber-500/60 hover:bg-amber-500/15 text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  Customize Stamp
                </button>
                <button
                  type="button"
                  onClick={() => triggerPhotoDownload(selectedPhoto)}
                  className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Original Quality
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(selectedPhoto.id);
                    setSelectedPhoto(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
