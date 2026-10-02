export interface AuthSession {
  username: string;
  role: 'admin' | 'staff';
  name: string;
  password?: string;
  loggedInAt: string;
}

export interface RegisteredUser {
  username: string;
  name: string;
  password: string;
  role: 'admin' | 'staff';
  active: boolean;
  requestedAt: string;
}

export interface PasswordValidationResult {
  isValid: boolean;
  score: number; // 0 to 4
  strengthLabel: 'Too Short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  strengthColor: string;
  hasLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
  matchesUsername: boolean;
  isBlacklisted: boolean;
  errorMessage?: string;
}
