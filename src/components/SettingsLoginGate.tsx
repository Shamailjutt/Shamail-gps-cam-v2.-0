import { FormEvent, useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { verifySettingsCredentials } from '../utils/auth';

interface SettingsLoginGateProps {
  defaultLogoUrl: string;
  onAuthenticated: (rememberUser: boolean) => void;
  onCancel: () => void;
}

export function SettingsLoginGate({
  defaultLogoUrl,
  onAuthenticated,
  onCancel,
}: SettingsLoginGateProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUser, setRememberUser] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (verifying) return;
    setErrorMsg(null);

    if (!username.trim() || !password) {
      setErrorMsg('Please enter both username and password.');
      return;
    }

    setVerifying(true);
    try {
      const ok = await verifySettingsCredentials(username, password, rememberUser);
      if (ok) {
        setPassword('');
        onAuthenticated(rememberUser);
      } else {
        setErrorMsg('Incorrect username or password. Access denied.');
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-8 sm:py-12 px-4">
      <div className="bg-[#14171F] border border-[#2B3142] rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative">
            <img
              src={defaultLogoUrl}
              alt="SHAMAIL PERA Security Emblem"
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-full object-cover border-2 border-amber-500/80 bg-[#07080B]"
            />
            <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-500 text-neutral-950 flex items-center justify-center border-2 border-[#14171F]">
              <Lock className="w-3.5 h-3.5" />
            </span>
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              SHAMAIL PERA Security
            </span>
            <h1 className="text-xl font-bold text-slate-100 mt-1">Protected Settings Login</h1>
            <p className="text-xs text-slate-400 mt-1">
              Sign in with authorized administrator credentials to modify camera, GPS, and watermark
              configuration.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-300">Username</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="Enter administrator username"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-300">Password</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Enter password"
                className="w-full min-h-[44px] pl-3.5 pr-11 rounded-xl bg-[#0D0F14] border border-[#2B3142] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-400 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>

          <label className="flex items-center gap-2.5 min-h-[40px] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberUser}
              onChange={(e) => setRememberUser(e.target.checked)}
              className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
            />
            <span className="text-xs text-slate-300">
              Remember User (keep settings unlocked across sessions)
            </span>
          </label>

          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/35 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 min-h-[46px] rounded-xl border border-[#2B3142] hover:bg-[#1B1F2B] text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
            >
              Back to Camera
            </button>
            <button
              type="submit"
              disabled={verifying}
              className="flex-[1.5] min-h-[46px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              {verifying ? 'Verifying...' : 'Unlock Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
