import React from 'react';
import { Check, X, AlertCircle } from 'lucide-react';
import { validatePassword } from '../utils/authStorage';

interface PasswordStrengthMeterProps {
  password: string;
  username?: string;
  confirmPassword?: string;
}

export function PasswordStrengthMeter({
  password,
  username = '',
  confirmPassword,
}: PasswordStrengthMeterProps) {
  if (!password) return null;

  const result = validatePassword(password, username);
  const hasConfirm = confirmPassword !== undefined && confirmPassword.length > 0;
  const isMatch = hasConfirm ? password === confirmPassword : true;

  return (
    <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 text-[11px] space-y-2 mt-2">
      {/* 4-segment strength bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-400 font-medium">Password Strength:</span>
          <span className={`font-bold ${
            result.strengthLabel === 'Strong' ? 'text-emerald-400' :
            result.strengthLabel === 'Good' ? 'text-blue-400' :
            result.strengthLabel === 'Fair' ? 'text-amber-400' :
            'text-rose-400'
          }`}>
            {result.strengthLabel}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1 h-1.5">
          {[1, 2, 3, 4].map((seg) => (
            <div
              key={seg}
              className={`h-full rounded-full transition-all ${
                result.score >= seg ? result.strengthColor : 'bg-zinc-800'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Checklist */}
      <div className="grid grid-cols-2 gap-1.5 text-[10px] pt-0.5">
        <div className={`flex items-center gap-1.5 ${result.hasLength ? 'text-emerald-400 font-medium' : 'text-zinc-500'}`}>
          {result.hasLength ? <Check className="w-3 h-3 shrink-0" /> : <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0 ml-0.5 mr-1" />}
          <span>At least 6 characters</span>
        </div>
        <div className={`flex items-center gap-1.5 ${result.hasLetter && result.hasNumber ? 'text-emerald-400 font-medium' : 'text-zinc-500'}`}>
          {result.hasLetter && result.hasNumber ? <Check className="w-3 h-3 shrink-0" /> : <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0 ml-0.5 mr-1" />}
          <span>Letters & numbers</span>
        </div>
        {hasConfirm && (
          <div className={`col-span-2 flex items-center gap-1.5 ${isMatch ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}`}>
            {isMatch ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />}
            <span>{isMatch ? 'Passwords match' : 'Passwords do not match yet'}</span>
          </div>
        )}
      </div>

      {/* Specific warnings */}
      {(result.isBlacklisted || result.matchesUsername) && (
        <div className="flex items-center gap-1.5 text-[10px] text-rose-400 font-medium pt-1 border-t border-zinc-800/80">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{result.errorMessage}</span>
        </div>
      )}
    </div>
  );
}
