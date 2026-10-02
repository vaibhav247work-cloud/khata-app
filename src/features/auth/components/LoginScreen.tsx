import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Building2, 
  UserCheck, 
  UserPlus, 
  User, 
  Lock, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  AlertCircle, 
  AlertTriangle, 
  CheckCircle2, 
  Send, 
  Link as LinkIcon, 
  ChevronDown, 
  ChevronUp, 
  ShieldCheck 
} from 'lucide-react';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { ToastNotification } from '../../../components/layout/ToastNotification';
import { type ToastState } from '../../../types/common';
import { type AuthSession } from '../../../types/auth';
import { validatePassword, saveRegisteredUser, getRegisteredUsers } from '../utils/authStorage';
import { verifyUserWithGoogleSheet, requestNewUserWithGoogleSheet } from '../../../sync';
import { AUTH_SESSION_KEY } from '../../../constants/keys';

interface LoginScreenProps {
  apiLink: string;
  setApiLink: (link: string) => void;
  isOnline: boolean;
  onLoginSuccess: (session: AuthSession) => void;
  toast: ToastState | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onDismissToast: () => void;
}

export function LoginScreen({
  apiLink,
  setApiLink,
  isOnline,
  onLoginSuccess,
  toast,
  showToast,
  onDismissToast,
}: LoginScreenProps) {
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [regRole, setRegRole] = useState<'staff' | 'admin'>('staff');
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);
  const [regStatusMessage, setRegStatusMessage] = useState<string | null>(null);

  const [showScriptConfig, setShowScriptConfig] = useState(false);
  const [quickApiLink, setQuickApiLink] = useState(apiLink);

  const handleSaveQuickApiLink = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLink = quickApiLink.trim();
    setApiLink(cleanLink);
    localStorage.setItem('BT_API_LINK', cleanLink);
    showToast(cleanLink ? 'Google Script Web App URL updated!' : 'Google Script URL cleared', 'success');
    setShowScriptConfig(false);
  };

  const fillDefaultAdminCredentials = () => {
    setLoginUsername('admin');
    setLoginPassword('admin');
    showToast('Filled default credentials: admin / admin', 'info');
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const username = loginUsername.trim();
    const password = loginPassword;

    if (!username || !password) {
      showToast('Please enter both username and password', 'error');
      return;
    }

    setIsLoggingIn(true);

    try {
      // 1. If Google Sheet API link is configured and device is online, verify live against Google Sheets Users tab
      if (apiLink && isOnline) {
        try {
          const res = await verifyUserWithGoogleSheet(apiLink, username, password);
          if (res.authenticated && res.user) {
            onLoginSuccess({
              username: res.user.username,
              role: res.user.role,
              name: res.user.name,
              password: password,
              loggedInAt: new Date().toISOString(),
            });
            return;
          } else {
            if (res.isPending) {
              showToast(res.message || 'Registration is pending admin approval in Google Sheets.', 'info');
            } else {
              showToast(res.message || 'Invalid credentials or disabled account in Google Sheet', 'error');
            }
            return;
          }
        } catch (sheetErr: any) {
          console.warn('Live Google Sheet authentication failed, checking local credentials:', sheetErr?.message || sheetErr);
        }
      }

      // 2. Local registered users check
      const localUsers = getRegisteredUsers();
      const matchedLocal = localUsers.find(
        (u) => u.username.toLowerCase() === username.toLowerCase()
      );
      if (matchedLocal) {
        if (!matchedLocal.active) {
          showToast('Your registration is pending administrator approval.', 'info');
          return;
        }
        if (matchedLocal.password === password) {
          onLoginSuccess({
            username: matchedLocal.username,
            role: matchedLocal.role,
            name: matchedLocal.name,
            password: password,
            loggedInAt: new Date().toISOString(),
          });
          return;
        } else {
          showToast('Incorrect password', 'error');
          return;
        }
      }

      // 3. Offline fallback: verify against previously authenticated user session credentials
      const savedSession = localStorage.getItem(AUTH_SESSION_KEY);
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);
          if (
            parsed.username &&
            parsed.username.toLowerCase() === username.toLowerCase() &&
            parsed.password === password
          ) {
            onLoginSuccess({
              username: parsed.username,
              role: parsed.role || 'staff',
              name: parsed.name || parsed.username,
              password: password,
              loggedInAt: new Date().toISOString(),
            });
            showToast(`Signed in offline as ${parsed.name || parsed.username}`, 'info');
            return;
          }
        } catch {}
      }

      // 4. First-time setup / Standalone Default Admin fallback
      if (username.toLowerCase() === 'admin' && password === 'admin') {
        onLoginSuccess({
          username: 'admin',
          role: 'admin',
          name: 'Administrator',
          password: 'admin',
          loggedInAt: new Date().toISOString(),
        });
        if (!apiLink) {
          showToast('Signed in as Default Admin. Connect your Google Sheet in Admin Settings.', 'success');
        } else {
          showToast('Signed in with Default Admin credentials', 'success');
        }
        return;
      }

      showToast('Invalid credentials or user not found. Please check your username and password.', 'error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRequestNewUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanUsername = regUsername.trim();
    const cleanName = regName.trim();
    const cleanPassword = regPassword;

    if (!cleanUsername || !cleanPassword) {
      showToast('Please fill in username and password', 'error');
      return;
    }

    if (cleanUsername.length < 3) {
      showToast('Username must be at least 3 characters', 'error');
      return;
    }

    if (cleanUsername.toLowerCase() === 'admin') {
      showToast("The username 'admin' is reserved for the primary administrator", 'error');
      return;
    }

    // Password security and strength validation
    const passValidation = validatePassword(cleanPassword, cleanUsername);
    if (!passValidation.isValid) {
      showToast(passValidation.errorMessage || 'Please choose a stronger password', 'error');
      return;
    }

    if (cleanPassword !== regConfirmPassword) {
      showToast('Passwords do not match. Please verify your confirm password.', 'error');
      return;
    }

    // Immediately save request locally so user request is never lost
    saveRegisteredUser({
      username: cleanUsername,
      name: cleanName || cleanUsername,
      password: cleanPassword,
      role: regRole,
      active: false,
      requestedAt: new Date().toISOString(),
    });

    setIsSubmittingReg(true);
    setRegStatusMessage(null);

    try {
      if (apiLink && isOnline) {
        const res = await requestNewUserWithGoogleSheet(apiLink, {
          username: cleanUsername,
          name: cleanName || cleanUsername,
          password: cleanPassword,
          role: regRole,
        });

        if (res.success) {
          setRegStatusMessage(res.message);
          showToast('Registration request sent to Google Sheet!', 'success');
          setRegPassword('');
          setRegConfirmPassword('');
          return;
        }

        if (res.isScriptOutdated) {
          setRegStatusMessage(
            'Your registration request has been saved on this device (pending administrator approval). To sync new users directly to your Google Sheet, please update the Google Apps Script in Google Sheets with the latest code from Admin Settings.'
          );
          showToast('Request saved locally (Google Apps Script update needed)', 'info');
          setRegPassword('');
          setRegConfirmPassword('');
          return;
        }

        if (!res.success) {
          showToast(res.message || 'Registration request could not be processed', 'error');
          return;
        }
      } else if (!apiLink) {
        setRegStatusMessage(
          'Your registration request has been saved locally on this device! Because Google Sheet URL is not configured yet, an administrator can activate your account in Admin Settings.'
        );
        showToast('Registration request saved locally (pending approval)', 'success');
        setRegPassword('');
        setRegConfirmPassword('');
        return;
      } else {
        setRegStatusMessage(
          'Device is currently offline. Your request has been saved locally and an administrator can activate it in Admin Settings.'
        );
        showToast('Saved offline. Admin can approve in local settings.', 'info');
        setRegPassword('');
        setRegConfirmPassword('');
      }
    } finally {
      setIsSubmittingReg(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 selection:bg-orange-500 selection:text-white">
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden"
      >
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-tr from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-orange-500/20">
            <Building2 className="text-white w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">KhataBook Pro</h1>
          <p className="text-zinc-400 text-xs mt-1">Multi-user Ledger & Order Accounting</p>
        </div>

        {/* Quick Google Script URL Banner */}
        <div className="mb-5 bg-zinc-950/60 border border-zinc-800 rounded-2xl overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setShowScriptConfig(!showScriptConfig)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <div className="flex items-center gap-2">
              <LinkIcon className="w-3.5 h-3.5 text-orange-400" />
              <span>{apiLink ? 'Google Script Web App Configured' : 'Configure Google Script URL (Optional)'}</span>
            </div>
            {showScriptConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showScriptConfig && (
            <form onSubmit={handleSaveQuickApiLink} className="p-3.5 border-t border-zinc-800/80 bg-zinc-900/50 space-y-2.5">
              <p className="text-[11px] text-zinc-400">
                Paste your Google Apps Script URL here so user logins and registrations sync live with your Google Sheet <code className="text-orange-300">Users</code> tab.
              </p>
              <input
                type="url"
                value={quickApiLink}
                onChange={(e) => setQuickApiLink(e.target.value)}
                placeholder="https://script.google.com/macros/s/..."
                className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-colors"
                >
                  Save URL
                </button>
                <button
                  type="button"
                  onClick={() => setShowScriptConfig(false)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* First-time Setup Helper Banner */}
        {!apiLink && (
          <div className="mb-5 p-3.5 bg-orange-500/10 border border-orange-500/25 rounded-2xl">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-orange-300">Default Admin Credentials</span>
                  <button
                    type="button"
                    onClick={fillDefaultAdminCredentials}
                    className="text-[10px] font-medium text-orange-400 hover:text-orange-300 underline underline-offset-2 ml-2 cursor-pointer"
                  >
                    Auto-fill admin/admin
                  </button>
                </div>
                <p className="text-zinc-300 text-[11px] mt-1 leading-relaxed">
                  No Google Script URL is configured yet. You can log in right away with default credentials: <strong className="text-orange-300">admin</strong> / <strong className="text-orange-300">admin</strong> to access the dashboard and paste your script URL in Admin settings.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mode Switcher: Sign In vs Request New User */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-950/80 rounded-2xl border border-zinc-800 mb-5">
          <button
            type="button"
            onClick={() => {
              setIsRegisterMode(false);
              setRegStatusMessage(null);
            }}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              !isRegisterMode
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-850'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegisterMode(true);
              setRegStatusMessage(null);
            }}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              isRegisterMode
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-850'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Request New User</span>
          </button>
        </div>

        {!isRegisterMode ? (
          /* --- Sign In View --- */
          <>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                    <User className="w-4 h-4" />
                  </div>
                  <input 
                    type="text" 
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                    placeholder="Enter username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    disabled={isLoggingIn}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded-xl pl-10 pr-11 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                    placeholder="Enter password"
                    autoComplete="current-password"
                    disabled={isLoggingIn}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button 
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-orange-500/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2 cursor-pointer"
              >
                {isLoggingIn ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <span>Sign In to Dashboard</span>
                )}
              </button>
            </form>

            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => setIsRegisterMode(true)}
                className="text-xs text-orange-400 hover:text-orange-300 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Don't have an account? Request new user</span>
              </button>
            </div>

            <div className="mt-6 pt-5 border-t border-zinc-800/80 text-center">
              <p className="text-[11px] text-zinc-500 leading-tight">
                User roles (<code className="text-zinc-400">Admin</code> or <code className="text-zinc-400">Staff</code>) and account status are automatically identified upon login.
              </p>
            </div>
          </>
        ) : (
          /* --- Request New User View --- */
          <div className="space-y-4">
            {regStatusMessage ? (
              <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-200 text-xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Request Submitted to Google Sheet!</span>
                </div>
                <p className="leading-relaxed text-zinc-300">
                  {regStatusMessage}
                </p>
                <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                  <p className="font-semibold text-zinc-300">Next Step for Administrator:</p>
                  <p>Open your Google Sheet, find the <span className="text-white font-mono font-semibold">Users</span> tab, and change the <span className="text-emerald-400 font-mono font-semibold">active</span> column to <span className="text-emerald-400 font-mono font-semibold">true</span> for this user.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(false);
                    setRegStatusMessage(null);
                  }}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  Proceed to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleRequestNewUser} className="space-y-3.5">
                {!apiLink ? (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2.5">
                    <div className="flex items-center gap-2 font-bold text-sm text-amber-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Google Script URL Required</span>
                    </div>
                    <p className="text-zinc-300 leading-relaxed text-[11px]">
                      User registration requests are synced directly to Google Sheets. Because no Script URL is configured yet, please sign in as <strong className="text-orange-300">admin</strong> / <strong className="text-orange-300">admin</strong> first, or set your Google Script URL above.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowScriptConfig(true)}
                        className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                      >
                        Set Script URL Now
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsRegisterMode(false);
                          fillDefaultAdminCredentials();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs transition-colors cursor-pointer"
                      >
                        Sign In as Admin
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 text-[11px] text-zinc-400 leading-relaxed flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                    <span>
                      New user requests are sent directly to your Google Sheet <span className="text-white font-medium">Users</span> tab with status <span className="text-amber-400 font-medium">pending</span>. You will be able to log in once an admin activates your account.
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Full Name</label>
                  <input 
                    type="text" 
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                    placeholder="e.g. John Doe"
                    autoComplete="name"
                    disabled={isSubmittingReg}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Desired Username</label>
                  <input 
                    type="text" 
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                    placeholder="e.g. jdoe"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    disabled={isSubmittingReg}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Password</label>
                    <div className="relative">
                      <input 
                        type={showRegPassword ? 'text' : 'password'} 
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded-xl px-3.5 pr-9 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                        placeholder="Min. 6 chars"
                        autoComplete="new-password"
                        disabled={isSubmittingReg}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-zinc-400 hover:text-white cursor-pointer"
                        tabIndex={-1}
                        aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                      >
                        {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Confirm</label>
                    <div className="relative">
                      <input 
                        type={showRegConfirmPassword ? 'text' : 'password'} 
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded-xl px-3.5 pr-9 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                        disabled={isSubmittingReg}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-zinc-400 hover:text-white cursor-pointer"
                        tabIndex={-1}
                        aria-label={showRegConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showRegConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Real-time Password Strength and Validation Checklist */}
                {regPassword && (
                  <PasswordStrengthMeter 
                    password={regPassword} 
                    username={regUsername} 
                    confirmPassword={regConfirmPassword} 
                  />
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Requested Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRegRole('staff')}
                      className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                        regRole === 'staff'
                          ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                          : 'bg-zinc-950/50 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Staff Member</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegRole('admin')}
                      className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                        regRole === 'admin'
                          ? 'bg-orange-600/20 text-orange-300 border-orange-500/50'
                          : 'bg-zinc-950/50 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Administrator</span>
                    </button>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isSubmittingReg}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-orange-500/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4 cursor-pointer"
                >
                  {isSubmittingReg ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>Submitting Request to Google Sheet...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Registration Request</span>
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRegisterMode(false)}
                    className="text-xs text-zinc-400 hover:text-white font-medium transition-colors cursor-pointer"
                  >
                    Already have an account? Sign In
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </motion.div>

      {/* Global Toast Notification */}
      <ToastNotification toast={toast} onDismiss={onDismissToast} />
    </div>
  );
}
