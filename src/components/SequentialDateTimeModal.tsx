import { useMemo, useState } from 'react';
import { Calendar, Check, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { WatermarkSettings } from '../types';
import { formatTimestampMillisClean } from '../utils/watermarkCanvas';

interface SequentialDateTimeModalProps {
  initialMillis: number;
  is24HourFormat: boolean;
  dateFormatPattern: WatermarkSettings['dateFormatPattern'];
  initialStep?: 'calendar' | 'clock';
  onConfirm: (confirmedMillis: number) => void;
  onCancel: () => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function SequentialDateTimeModal({
  initialMillis,
  is24HourFormat,
  dateFormatPattern,
  initialStep = 'calendar',
  onConfirm,
  onCancel,
}: SequentialDateTimeModalProps) {
  const initDate = useMemo(() => new Date(initialMillis), [initialMillis]);

  const [step, setStep] = useState<'calendar' | 'clock' | 'confirm'>(initialStep);
  const [viewYear, setViewYear] = useState<number>(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initDate.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(initDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(initDate.getMonth());
  const [selectedDay, setSelectedDay] = useState<number>(initDate.getDate());

  const initHour24 = initDate.getHours();
  const [hour24, setHour24] = useState<number>(initHour24);
  const [hour12, setHour12] = useState<number>(initHour24 % 12 || 12);
  const [period, setPeriod] = useState<'AM' | 'PM'>(initHour24 >= 12 ? 'PM' : 'AM');
  const [minute, setMinute] = useState<number>(initDate.getMinutes());
  const [second, setSecond] = useState<number>(initDate.getSeconds());

  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  const resolvedHour24 = useMemo(() => {
    if (is24HourFormat) return hour24;
    if (period === 'AM') return hour12 === 12 ? 0 : hour12;
    return hour12 === 12 ? 12 : hour12 + 12;
  }, [is24HourFormat, hour24, hour12, period]);

  const candidateMillis = useMemo(() => {
    return new Date(
      selectedYear,
      selectedMonth,
      selectedDay,
      resolvedHour24,
      minute,
      second
    ).getTime();
  }, [selectedYear, selectedMonth, selectedDay, resolvedHour24, minute, second]);

  const formattedCandidate = useMemo(
    () => formatTimestampMillisClean(candidateMillis, dateFormatPattern, is24HourFormat),
    [candidateMillis, dateFormatPattern, is24HourFormat]
  );

  const handleSelectDay = (day: number) => {
    setSelectedYear(viewYear);
    setSelectedMonth(viewMonth);
    setSelectedDay(day);
    // Automatically advance from Calendar to Clock per sequential picker specification
    setStep('clock');
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#14171F] border border-[#2B3142] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Step Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-[#0D0F14] border-b border-[#2B3142]">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
              {step === 'calendar'
                ? 'Step 1 of 3 · Select Date'
                : step === 'clock'
                  ? `Step 2 of 3 · Select Time (${is24HourFormat ? '24-Hour' : '12-Hour AM/PM'})`
                  : 'Step 3 of 3 · Confirm Timestamp'}
            </span>
            <h3 className="text-sm font-bold text-slate-100 mt-0.5">
              {step === 'calendar'
                ? 'Choose Calendar Date'
                : step === 'clock'
                  ? 'Choose Clock Time'
                  : 'Confirm Date & Time'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close date and time picker"
            className="w-9 h-9 rounded-lg border border-[#2B3142] hover:bg-[#1B1F2B] flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 1: Calendar */}
        {step === 'calendar' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="w-9 h-9 rounded-lg bg-[#0D0F14] border border-[#2B3142] hover:border-amber-500/60 flex items-center justify-center text-slate-200 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-100">
                  {MONTH_NAMES[viewMonth]}
                </span>
                <input
                  type="number"
                  value={viewYear}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    if (y >= 1970 && y <= 2100) setViewYear(y);
                  }}
                  aria-label="Calendar Year"
                  className="w-20 px-2 py-1 rounded-lg bg-[#0D0F14] border border-[#2B3142] text-xs font-mono text-amber-400 text-center focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="w-9 h-9 rounded-lg bg-[#0D0F14] border border-[#2B3142] hover:border-amber-500/60 flex items-center justify-center text-slate-200 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((wd) => (
                <div key={wd} className="text-[11px] font-semibold text-slate-500 py-1">
                  {wd}
                </div>
              ))}
              {calendarCells.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty_${idx}`} className="h-9" />;
                }
                const isSelected =
                  day === selectedDay && viewMonth === selectedMonth && viewYear === selectedYear;
                return (
                  <button
                    key={`day_${day}`}
                    type="button"
                    onClick={() => handleSelectDay(day)}
                    className={`h-9 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-neutral-950 font-bold'
                        : 'text-slate-200 hover:bg-[#1B1F2B] hover:text-amber-300'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#2B3142]">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setViewYear(now.getFullYear());
                  setViewMonth(now.getMonth());
                  handleSelectDay(now.getDate());
                }}
                className="text-xs font-medium text-amber-400 hover:underline cursor-pointer"
              >
                Select Today
              </button>
              <button
                type="button"
                onClick={() => setStep('clock')}
                className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" />
                Next: Select Time
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Clock */}
        {step === 'clock' && (
          <div className="p-5 space-y-5">
            <div className="p-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                Selected Date
              </span>
              <span className="font-mono font-semibold text-slate-100">
                {String(selectedDay).padStart(2, '0')} {MONTH_NAMES[selectedMonth].slice(0, 3)}{' '}
                {selectedYear}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 items-end">
              <label className="block space-y-1.5">
                <span className="text-xs text-slate-400">
                  {is24HourFormat ? 'Hour (00–23)' : 'Hour (1–12)'}
                </span>
                {is24HourFormat ? (
                  <select
                    value={hour24}
                    onChange={(e) => setHour24(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-sm font-mono text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={hour12}
                    onChange={(e) => setHour12(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-sm font-mono text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    {Array.from({ length: 12 }, (_, idx) => idx + 1).map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs text-slate-400">Minute (00–59)</span>
                <select
                  value={minute}
                  onChange={(e) => setMinute(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-sm font-mono text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  {Array.from({ length: 60 }, (_, m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs text-slate-400">Second (00–59)</span>
                <select
                  value={second}
                  onChange={(e) => setSecond(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-sm font-mono text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  {Array.from({ length: 60 }, (_, s) => (
                    <option key={s} value={s}>
                      {String(s).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* AM / PM Selector shown ONLY in 12-hour format */}
            {!is24HourFormat && (
              <div className="space-y-1.5">
                <span className="text-xs text-slate-400 block">Meridiem (AM / PM)</span>
                <div className="grid grid-cols-2 gap-2 p-1 bg-[#0D0F14] rounded-xl border border-[#2B3142]">
                  {(['AM', 'PM'] as const).map((meridiem) => (
                    <button
                      key={meridiem}
                      type="button"
                      onClick={() => setPeriod(meridiem)}
                      className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        period === meridiem
                          ? 'bg-amber-500 text-neutral-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {meridiem}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#2B3142]">
              <button
                type="button"
                onClick={() => setStep('calendar')}
                className="px-4 min-h-[42px] rounded-xl border border-[#2B3142] hover:bg-[#1B1F2B] text-xs font-medium text-slate-300 transition-colors cursor-pointer"
              >
                &larr; Calendar
              </button>
              <button
                type="button"
                onClick={() => setStep('confirm')}
                className="px-5 min-h-[42px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors cursor-pointer"
              >
                Review &amp; Confirm &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation Screen */}
        {step === 'confirm' && (
          <div className="p-5 space-y-5">
            <div className="p-4 rounded-xl bg-[#0D0F14] border border-amber-500/40 text-center space-y-2">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 block">
                Watermark Display Timestamp
              </span>
              <p className="text-base font-mono font-bold text-amber-300">{formattedCandidate}</p>
              <p className="text-[11px] text-slate-400">
                Appears cleanly on the photograph watermark without any extra tags.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setStep('calendar')}
                className="px-3.5 min-h-[44px] rounded-xl border border-[#2B3142] hover:bg-[#1B1F2B] text-xs font-medium text-slate-300 transition-colors cursor-pointer"
              >
                Change Again
              </button>
              <button
                type="button"
                onClick={() => onConfirm(candidateMillis)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Confirm &amp; Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
