import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertCircle,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  CheckCircle2,
  Crown,
  ArrowRight,
  KeyRound,
  Copy,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatAuthError, activeFirebaseConfig } from '../../lib/firebase';

interface LoginPageProps {
  navigate: (path: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ navigate }) => {
  const {
    login,
    loginWithEmail,
    signupWithEmail,
    resetPassword,
    isAdminClaimed,
    checkAdminClaimed,
  } = useApp();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sign-in state
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);

  // Sign-up state
  const [signUpName, setSignUpName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState('');
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [isRegisteringAdmin, setIsRegisteringAdmin] = useState(false);
  const [adminSetupCode, setAdminSetupCode] = useState('');
  const [showAdminCodeInput, setShowAdminCodeInput] = useState(false);

  // Password reset state
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [copiedConfig, setCopiedConfig] = useState(false);

  const handleCopyConfig = () => {
    const configToCopy = JSON.stringify(
      {
        projectId: activeFirebaseConfig.projectId || 'florify-c5dea',
        apiKey: activeFirebaseConfig.apiKey || '',
        authDomain: activeFirebaseConfig.authDomain || 'florify-c5dea.firebaseapp.com',
        firestoreDatabaseId: activeFirebaseConfig.firestoreDatabaseId || '(default)',
        storageBucket: activeFirebaseConfig.storageBucket || 'florify-c5dea.firebasestorage.app',
        messagingSenderId: activeFirebaseConfig.messagingSenderId || '1048917662360',
        appId: activeFirebaseConfig.appId || '1048917662360',
      },
      null,
      2
    );
    navigator.clipboard.writeText(configToCopy);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2500);
  };

  // Refresh admin claimed status when switching to signup
  useEffect(() => {
    checkAdminClaimed().then((claimed) => {
      // Default to checking admin if it's the very first setup
      if (!claimed) {
        setIsRegisteringAdmin(true);
      }
    });
  }, [mode]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await login();
    } catch (err: any) {
      console.error(err);
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail.trim() || !signInPassword) {
      setError('Please enter both your email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await loginWithEmail(signInEmail.trim(), signInPassword);
    } catch (err: any) {
      console.error(err);
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpName.trim()) {
      setError('Please provide your full name.');
      return;
    }
    if (!signUpEmail.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!signUpPassword) {
      setError('Please enter a password.');
      return;
    }
    if (signUpPassword.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }
    if (signUpPassword !== signUpConfirmPassword) {
      setError('Passwords do not match. Please verify and try again.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Check if admin setup code was provided when admin claimed
      const willRegisterAdmin = isRegisteringAdmin;
      await signupWithEmail(
        signUpEmail.trim(),
        signUpPassword,
        signUpName.trim(),
        willRegisterAdmin,
        adminSetupCode.trim()
      );
    } catch (err: any) {
      console.error(err);
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = resetEmail.trim() || signInEmail.trim();
    if (!targetEmail) {
      setError('Please enter your email address to receive password reset instructions.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await resetPassword(targetEmail);
      setSuccessMessage(`Password reset link has been sent to ${targetEmail}. Please check your inbox.`);
      setIsResettingPassword(false);
    } catch (err: any) {
      console.error(err);
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF7F9] flex flex-col justify-center items-center px-4 py-8 sm:py-12">
      <div className="max-w-md w-full bg-white rounded-2xl border border-[#FDC3D1] shadow-sm p-6 sm:p-8 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-[#FFF7F9] border border-[#FDC3D1] flex items-center justify-center p-2.5 shadow-xs overflow-hidden">
            <img
              src="/logo.png"
              alt="Florify Logo"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#2E1826]">
              Florify
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#826674] leading-relaxed">
              IoT temperature & humidity monitoring with automated ventilation for fleet shuttles.
            </p>
          </div>
        </div>

        {/* Primary Recommended Google Sign-In */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-[#FDC3D1] bg-white text-[#2E1826] text-xs sm:text-sm font-semibold hover:bg-[#FFF7F9] hover:border-[#FF5C89] focus:outline-none focus:ring-2 focus:ring-[#FF5C89]/30 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.98 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>{loading ? 'Connecting...' : 'Continue with Google (Instant)'}</span>
          </button>

          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#FDC3D1]" />
            </div>
            <div className="relative flex justify-center text-[11px]">
              <span className="bg-white px-3 text-[#826674] font-medium">
                or sign in with email
              </span>
            </div>
          </div>
        </div>

        {/* Auth Mode Tabs */}
        <div className="grid grid-cols-2 p-1 bg-[#FFF7F9] rounded-xl border border-[#FDC3D1]">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError(null);
              setSuccessMessage(null);
              setIsResettingPassword(false);
            }}
            className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
              mode === 'signin'
                ? 'bg-white text-[#2E1826] shadow-xs'
                : 'text-[#826674] hover:text-[#2E1826]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError(null);
              setSuccessMessage(null);
              setIsResettingPassword(false);
            }}
            className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
              mode === 'signup'
                ? 'bg-white text-[#2E1826] shadow-xs'
                : 'text-[#826674] hover:text-[#2E1826]'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 text-left flex flex-col gap-2.5 animate-fadeIn">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <div className="flex-1 font-medium leading-relaxed">{error}</div>
            </div>

            {error.includes('Email/Password') && (
              <div className="pt-2 border-t border-rose-200 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full py-2 px-3 rounded-lg bg-[#FF5C89] hover:bg-[#FF4275] text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <span>Sign In with Google Instead (Already Enabled)</span>
                </button>
                <p className="text-[11px] text-rose-700 leading-normal">
                  To enable email login, open your Firebase Console &rarr; Authentication &rarr; Sign-in method, click "Email/Password" and toggle it on.
                </p>
              </div>
            )}

            {error.includes('Invalid email or password') && mode === 'signin' && signInEmail && (
              <div className="pt-2 border-t border-rose-200 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    try {
                      await signupWithEmail(
                        signInEmail.trim(),
                        signInPassword,
                        signInEmail.split('@')[0],
                        !isAdminClaimed
                      );
                    } catch (err: any) {
                      setMode('signup');
                      setSignUpEmail(signInEmail);
                      setSignUpPassword(signInPassword);
                      setSignUpConfirmPassword(signInPassword);
                      setError(formatAuthError(err));
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading || !signInPassword}
                  className="w-full py-2 px-3 rounded-lg bg-[#FF5C89] hover:bg-[#FF4275] text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <span>First time on this database? Register "{signInEmail}" now &rarr;</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Success Notification */}
        {successMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 text-left flex items-start gap-2.5 animate-fadeIn">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
            <div className="flex-1 font-medium leading-relaxed">{successMessage}</div>
          </div>
        )}

        {/* Password Reset Modal / View */}
        {isResettingPassword ? (
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div className="text-left">
              <h2 className="text-sm font-bold text-[#2E1826]">Reset Your Password</h2>
              <p className="text-xs text-[#826674] mt-1">
                Enter your registered email address and we'll send you a password recovery link.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1.5 text-left">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#826674]" />
                <input
                  type="email"
                  value={resetEmail || signInEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="driver@example.com"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-[#FDC3D1] bg-white text-[#2E1826] placeholder-[#BFA6B3] focus:outline-none focus:ring-2 focus:ring-[#FF5C89]/30 focus:border-[#FF5C89] transition-all"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsResettingPassword(false)}
                className="flex-1 py-2.5 text-xs font-semibold rounded-xl border border-[#FDC3D1] text-[#826674] hover:bg-[#FFF7F9] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 text-xs font-semibold rounded-xl bg-[#FF5C89] hover:bg-[#FF4275] text-white shadow-xs focus:ring-2 focus:ring-[#FF5C89]/30 transition-all disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Sending Link...' : 'Send Reset Link'}
              </button>
            </div>
          </form>
        ) : mode === 'signin' ? (
          /* ======================================================== */
          /* SIGN IN FORM                                             */
          /* ======================================================== */
          <form onSubmit={handleSignIn} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1.5">
                Email Address or Admin Username
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#826674]" />
                <input
                  type="text"
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  placeholder="admin@florify.internal or username"
                  autoComplete="username"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-[#FDC3D1] bg-white text-[#2E1826] placeholder-[#BFA6B3] focus:outline-none focus:ring-2 focus:ring-[#FF5C89]/30 focus:border-[#FF5C89] transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-[#2E1826]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setIsResettingPassword(true)}
                  className="text-[11px] font-semibold text-[#C72C5E] hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#826674]" />
                <input
                  type={showSignInPassword ? 'text' : 'password'}
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm rounded-xl border border-[#FDC3D1] bg-white text-[#2E1826] placeholder-[#BFA6B3] focus:outline-none focus:ring-2 focus:ring-[#FF5C89]/30 focus:border-[#FF5C89] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowSignInPassword(!showSignInPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#826674] hover:text-[#2E1826] focus:outline-none cursor-pointer"
                >
                  {showSignInPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#FF5C89] hover:bg-[#FF4275] text-white text-sm font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-[#FF5C89]/30 transition-all disabled:opacity-50 cursor-pointer"
            >
              <span>{loading ? 'Signing In...' : 'Sign In with Email'}</span>
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        ) : (
          /* ======================================================== */
          /* CREATE ACCOUNT / SIGN UP FORM                            */
          /* ======================================================== */
          <form onSubmit={handleSignUp} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#826674]" />
                <input
                  type="text"
                  value={signUpName}
                  onChange={(e) => setSignUpName(e.target.value)}
                  placeholder="e.g. Maria Clara"
                  autoComplete="name"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-[#FDC3D1] bg-white text-[#2E1826] placeholder-[#BFA6B3] focus:outline-none focus:ring-2 focus:ring-[#FF5C89]/30 focus:border-[#FF5C89] transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#826674]" />
                <input
                  type="email"
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-[#FDC3D1] bg-white text-[#2E1826] placeholder-[#BFA6B3] focus:outline-none focus:ring-2 focus:ring-[#FF5C89]/30 focus:border-[#FF5C89] transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1.5">
                Password <span className="font-normal text-[#826674]">(min. 6 characters)</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#826674]" />
                <input
                  type={showSignUpPassword ? 'text' : 'password'}
                  value={signUpPassword}
                  onChange={(e) => setSignUpPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm rounded-xl border border-[#FDC3D1] bg-white text-[#2E1826] placeholder-[#BFA6B3] focus:outline-none focus:ring-2 focus:ring-[#FF5C89]/30 focus:border-[#FF5C89] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#826674] hover:text-[#2E1826] focus:outline-none cursor-pointer"
                >
                  {showSignUpPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#826674]" />
                <input
                  type={showSignUpPassword ? 'text' : 'password'}
                  value={signUpConfirmPassword}
                  onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-[#FDC3D1] bg-white text-[#2E1826] placeholder-[#BFA6B3] focus:outline-none focus:ring-2 focus:ring-[#FF5C89]/30 focus:border-[#FF5C89] transition-all"
                />
              </div>
            </div>

            {/* ONE-TIME ADMIN ACCOUNT SETUP SECTION */}
            <div className="p-3.5 rounded-xl border border-[#FDC3D1] bg-[#FFF7F9]/80 space-y-2.5">
              {!isAdminClaimed ? (
                <>
                  <div className="flex items-start gap-2.5">
                    <Crown className="h-4 w-4 text-[#FF5C89] shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#2E1826]">
                          One-Time Admin Setup
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#FF5C89]/15 text-[#C72C5E] px-2 py-0.5 rounded-full">
                          Available
                        </span>
                      </div>
                      <p className="text-[11px] text-[#826674] mt-0.5 leading-relaxed">
                        No administrator account is registered yet. Enable this option to initialize your root Administrator credentials.
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 pt-1 text-xs font-semibold text-[#2E1826] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isRegisteringAdmin}
                      onChange={(e) => setIsRegisteringAdmin(e.target.checked)}
                      className="h-4 w-4 rounded border-[#FDC3D1] text-[#FF5C89] focus:ring-[#FF5C89] cursor-pointer"
                    />
                    <span>Create as Primary Administrator (One-Time Setup)</span>
                  </label>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="h-4 w-4 text-[#FF5C89] shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span className="text-xs font-bold text-[#2E1826]">
                        Driver Registration
                      </span>
                      <p className="text-[11px] text-[#826674] mt-0.5 leading-relaxed">
                        Primary administrator is already established. Your driver account will be submitted for admin verification.
                      </p>
                    </div>
                  </div>

                  {/* Optional Admin Passcode expansion */}
                  <div className="pt-1">
                    {!showAdminCodeInput ? (
                      <button
                        type="button"
                        onClick={() => setShowAdminCodeInput(true)}
                        className="text-[11px] font-semibold text-[#C72C5E] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <KeyRound className="h-3 w-3" />
                        <span>Have an Admin Setup Code?</span>
                      </button>
                    ) : (
                      <div className="space-y-1.5 pt-1">
                        <label className="block text-[11px] font-semibold text-[#2E1826]">
                          Admin Passcode / Master Key
                        </label>
                        <input
                          type="text"
                          value={adminSetupCode}
                          onChange={(e) => {
                            setAdminSetupCode(e.target.value);
                            setIsRegisteringAdmin(e.target.value.trim().length > 0);
                          }}
                          placeholder="Enter admin authorization key"
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#FDC3D1] bg-white text-[#2E1826]"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#FF5C89] hover:bg-[#FF4275] text-white text-sm font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-[#FF5C89]/30 transition-all disabled:opacity-50 cursor-pointer"
            >
              <span>
                {loading
                  ? 'Creating Account...'
                  : isRegisteringAdmin
                  ? 'Create Administrator Account'
                  : 'Register Driver Account'}
              </span>
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        )}

        {/* Enterprise Security Footer */}
        <p className="pt-2 text-[11px] text-[#826674] text-center flex items-center justify-center gap-1.5 border-t border-[#FDC3D1]/60">
          <ShieldCheck className="h-3.5 w-3.5 text-[#FF5C89]" />
          Enterprise-grade secure authentication. Powered by Florify.
        </p>
      </div>

      {/* Database Connection Info & Quick Copy Helper */}
      <div className="mt-3.5 flex items-center justify-between gap-3 px-4 py-2 bg-white/70 backdrop-blur-xs rounded-xl border border-[#FDC3D1] text-[11px] text-[#826674] max-w-md w-full shadow-2xs">
        <div className="flex items-center gap-1.5 truncate">
          <span className="font-semibold text-[#2E1826]">Database:</span>
          <span className="font-mono text-[#C72C5E] truncate">
            {activeFirebaseConfig.projectId || 'florify-c5dea'} · {activeFirebaseConfig.firestoreDatabaseId || '(default)'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopyConfig}
          className="flex items-center gap-1 text-[#C72C5E] hover:text-[#FF5C89] font-medium shrink-0 cursor-pointer transition-colors"
          title="Copy ready-to-paste VITE_FIREBASE_CONFIG JSON"
        >
          {copiedConfig ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-emerald-700 font-semibold">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy Config</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
