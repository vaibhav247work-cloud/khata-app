import { type RegisteredUser, type PasswordValidationResult } from '../../../types/auth';
import { LOCAL_USERS_KEY, COMMON_WEAK_PASSWORDS } from '../../../constants/keys';

export const getRegisteredUsers = (): RegisteredUser[] => {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
};

export const saveRegisteredUser = (user: RegisteredUser) => {
  try {
    const users = getRegisteredUsers().filter(
      (u) => u.username.toLowerCase() !== user.username.toLowerCase()
    );
    users.push(user);
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {}
};

export const updateRegisteredUserStatus = (username: string, updates: Partial<RegisteredUser>) => {
  try {
    const users = getRegisteredUsers().map((u) => {
      if (u.username.toLowerCase() === username.toLowerCase()) {
        return { ...u, ...updates };
      }
      return u;
    });
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {}
};

export const deleteRegisteredUser = (username: string) => {
  try {
    const users = getRegisteredUsers().filter(
      (u) => u.username.toLowerCase() !== username.toLowerCase()
    );
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {}
};

export const validatePassword = (password: string, username = ''): PasswordValidationResult => {
  const trimmed = password.trim();
  const cleanUser = username.trim().toLowerCase();
  const hasLength = trimmed.length >= 6;
  const hasLetter = /[a-zA-Z]/.test(trimmed);
  const hasNumber = /[0-9]/.test(trimmed);
  const hasSpecial = /[^a-zA-Z0-9]/.test(trimmed);
  const matchesUsername = Boolean(cleanUser && cleanUser.length >= 3 && trimmed.toLowerCase() === cleanUser);
  const isBlacklisted = COMMON_WEAK_PASSWORDS.has(trimmed.toLowerCase());

  let score = 0;
  if (hasLength) score++;
  if (hasLetter && hasNumber) score++;
  if (trimmed.length >= 8) score++;
  if (hasSpecial || (trimmed.length >= 10 && hasLetter && hasNumber)) score++;

  if (isBlacklisted || matchesUsername) {
    score = Math.min(score, 1);
  }

  let strengthLabel: PasswordValidationResult['strengthLabel'] = 'Too Short';
  let strengthColor = 'bg-zinc-700';

  if (!trimmed) {
    strengthLabel = 'Too Short';
    strengthColor = 'bg-zinc-700';
  } else if (!hasLength || score <= 1) {
    strengthLabel = 'Weak';
    strengthColor = 'bg-rose-500';
  } else if (score === 2) {
    strengthLabel = 'Fair';
    strengthColor = 'bg-amber-500';
  } else if (score === 3) {
    strengthLabel = 'Good';
    strengthColor = 'bg-blue-500';
  } else {
    strengthLabel = 'Strong';
    strengthColor = 'bg-emerald-500';
  }

  let errorMessage: string | undefined;
  if (!trimmed) {
    errorMessage = 'Password is required';
  } else if (!hasLength) {
    errorMessage = 'Password must be at least 6 characters long';
  } else if (!hasLetter || !hasNumber) {
    errorMessage = 'Password must contain both letters and numbers';
  } else if (isBlacklisted) {
    errorMessage = 'This password is too easily guessed (e.g. common dictionary word). Please choose a more secure password';
  } else if (matchesUsername) {
    errorMessage = 'Password cannot be the same as your username';
  }

  return {
    isValid: !errorMessage,
    score,
    strengthLabel,
    strengthColor,
    hasLength,
    hasLetter,
    hasNumber,
    matchesUsername,
    isBlacklisted,
    errorMessage,
  };
};
