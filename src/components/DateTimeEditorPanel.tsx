import { useState } from 'react';
import { Calendar, Clock, RotateCcw } from 'lucide-react';
import { GpsData, TimestampMode, WatermarkSettings } from '../types';
import { formatWatermarkTimestamp, resolveTimestampMillis } from '../utils/watermarkCanvas';
import { SequentialDateTimeModal } from './SequentialDateTimeModal';

interface DateTimeEditorPanelProps {
  settings: WatermarkSettings;
  gps: GpsData;
  nowMillis: number;
  onChange: (next: WatermarkSettings) => void;
}

export function DateTimeEditorPanel({
  settings,
  gps,
  nowMillis,
  onChange,
}: DateTimeEditorPanelProps) {
  const [pickerStep, setPickerStep] = useState<'calendar' | 'clock' | null>(null);

  const handleResetToCurrent = () => {
    const current = Date.now();
    onChange({
      ...settings,
      timestampMode: TimestampMode.AutoDevice,
      manualTimestampMillis: current,
    });
  };

  const effectiveMs = resolveTimestampMillis(settings, gps, nowMillis);
  const liveFormatted = formatWatermarkTimestamp(settings, gps, nowMillis);

  return (
    <div className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Date &amp; Time Configuration</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Calendar &rarr; Clock &rarr; Confirm clean watermark timestamp
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetToCurrent}
          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl border border-[#2B3142] text-xs font-medium text-slate-200 hover:bg-[#1B1F2B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
          Reset Now
        </button>
      </div>

      {/* Segmented Timestamp Source Selector */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
        <button
          type="button"
          onClick={() => onChange({ ...settings, timestampMode: TimestampMode.AutoDevice })}
          className={`px-2.5 py-2 min-h-[38px] rounded-lg text-xs font-medium transition-colors whitespace-nowrap truncate cursor-pointer ${
            settings.timestampMode === TimestampMode.AutoDevice
              ? 'bg-amber-500 text-neutral-950 font-bold'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Auto Device
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...settings, timestampMode: TimestampMode.GpsFix })}
          className={`px-2.5 py-2 min-h-[38px] rounded-lg text-xs font-medium transition-colors whitespace-nowrap truncate cursor-pointer ${
            settings.timestampMode === TimestampMode.GpsFix
              ? 'bg-amber-500 text-neutral-950 font-bold'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          GPS Time
        </button>
        <button
          type="button"
          onClick={() => setPickerStep('calendar')}
          className={`px-2.5 py-2 min-h-[38px] rounded-lg text-xs font-medium transition-colors whitespace-nowrap truncate cursor-pointer ${
            settings.timestampMode === TimestampMode.Manual
              ? 'bg-amber-500 text-neutral-950 font-bold'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Custom Pick
        </button>
      </div>

      {/* Sequential Calendar -> Clock Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setPickerStep('calendar')}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors cursor-pointer"
        >
          <Calendar className="w-4 h-4" />
          Pick Date &amp; Time
        </button>

        <button
          type="button"
          onClick={() => setPickerStep('clock')}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#1B1F2B] hover:bg-[#232938] border border-[#2B3142] text-slate-100 text-xs font-semibold transition-colors cursor-pointer"
        >
          <Clock className="w-4 h-4 text-amber-400" />
          Adjust Clock Only
        </button>
      </div>

      {/* 12-Hour / 24-Hour Format Toggle */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-slate-300">Clock Format</span>
        <div className="flex items-center gap-1 p-1 bg-[#0D0F14] rounded-lg border border-[#2B3142]">
          <button
            type="button"
            onClick={() => onChange({ ...settings, is24HourFormat: false })}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              !settings.is24HourFormat
                ? 'bg-[#1B1F2B] text-amber-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            12-Hour (AM/PM)
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...settings, is24HourFormat: true })}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              settings.is24HourFormat
                ? 'bg-[#1B1F2B] text-amber-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            24-Hour
          </button>
        </div>
      </div>

      {/* Editor-Only Source & Active Clean Stamp Readout */}
      <div className="pt-3 border-t border-[#2B3142] space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400">Watermark Output</span>
          <span className="font-mono tabular-nums text-amber-300 font-semibold truncate">
            {liveFormatted}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>Editor Source</span>
          <span>
            {settings.timestampMode === TimestampMode.Manual
              ? 'Custom Selected Date & Time (File capture metadata preserved separately)'
              : settings.timestampMode === TimestampMode.GpsFix
                ? 'GPS Satellite Fix Clock'
                : 'Live Device Clock'}
          </span>
        </div>
      </div>

      {pickerStep && (
        <SequentialDateTimeModal
          initialMillis={effectiveMs}
          is24HourFormat={settings.is24HourFormat}
          dateFormatPattern={settings.dateFormatPattern}
          initialStep={pickerStep}
          onCancel={() => setPickerStep(null)}
          onConfirm={(confirmedMillis) => {
            setPickerStep(null);
            onChange({
              ...settings,
              timestampMode: TimestampMode.Manual,
              manualTimestampMillis: confirmedMillis,
            });
          }}
        />
      )}
    </div>
  );
}
