import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import fallbackAppletConfig from '../../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

export function parseConfigString(raw: string): any {
  if (!raw || typeof raw !== 'string') return null;
  let clean = raw.trim();

  // If the whole string was JSON-stringified (starts and ends with double quotes)
  if (clean.startsWith('"') && clean.endsWith('"')) {
    try {
      const unquoted = JSON.parse(clean);
      if (typeof unquoted === 'object' && unquoted !== null) {
        return unquoted;
      }
      if (typeof unquoted === 'string') {
        clean = unquoted.trim();
      }
    } catch {
      clean = clean.slice(1, -1).trim();
    }
  } else if (clean.startsWith("'") && clean.endsWith("'")) {
    clean = clean.slice(1, -1).trim();
  }

  // Strip JavaScript variable declarations like "const firebaseConfig =" or "var config ="
  clean = clean.replace(/^(const|let|var)\s+[a-zA-Z0-9_$]+\s*=\s*/, '').trim();
  // Strip trailing semicolon
  if (clean.endsWith(';')) {
    clean = clean.slice(0, -1).trim();
  }

  // 1. Try direct JSON.parse
  try {
    const res = JSON.parse(clean);
    if (typeof res === 'object' && res !== null) return res;
  } catch {
    // 2. If it's a JS object with unquoted keys or single quotes
    try {
      const jsonLike = clean
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
        .replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"');
      const res2 = JSON.parse(jsonLike);
      if (typeof res2 === 'object' && res2 !== null) return res2;
    } catch {
      return null;
    }
  }
  return null;
}

function resolveFirebaseConfig(): FirebaseClientConfig {
  const env = (import.meta as any).env || {};

  // 1. Check if user provided full JSON config in VITE_FIREBASE_CONFIG secret
  const rawConfig = env.VITE_FIREBASE_CONFIG || env.FIREBASE_CONFIG;
  if (rawConfig) {
    const parsed = parseConfigString(rawConfig);
    if (parsed && typeof parsed === 'object') {
      console.log('Firebase initialized using VITE_FIREBASE_CONFIG secret.');
      const projectId = parsed.projectId || fallbackAppletConfig.projectId;
      return {
        apiKey: parsed.apiKey || fallbackAppletConfig.apiKey,
        projectId,
        authDomain: parsed.authDomain || (projectId ? `${projectId}.firebaseapp.com` : fallbackAppletConfig.authDomain),
        firestoreDatabaseId: parsed.firestoreDatabaseId || parsed.databaseId || fallbackAppletConfig.firestoreDatabaseId || '(default)',
        storageBucket: parsed.storageBucket || (projectId ? `${projectId}.firebasestorage.app` : fallbackAppletConfig.storageBucket),
        messagingSenderId: parsed.messagingSenderId || fallbackAppletConfig.messagingSenderId,
        appId: parsed.appId || fallbackAppletConfig.appId,
      };
    }
  }

  // 2. Check individual VITE_ environment variables / secrets
  const envApiKey =
    env.VITE_FIREBASE_API_KEY ||
    env.FIREBASE_API_KEY ||
    env.VITE_API_KEY ||
    env.API_KEY;

  const envProjectId =
    env.VITE_FIREBASE_PROJECT_ID ||
    env.FIREBASE_PROJECT_ID ||
    env.VITE_PROJECT_ID ||
    env.PROJECT_ID;

  const envAuthDomain =
    env.VITE_FIREBASE_AUTH_DOMAIN ||
    env.FIREBASE_AUTH_DOMAIN ||
    env.VITE_AUTH_DOMAIN ||
    env.AUTH_DOMAIN;

  const envAppId =
    env.VITE_FIREBASE_APP_ID ||
    env.FIREBASE_APP_ID ||
    env.VITE_APP_ID ||
    env.APP_ID;

  const envStorageBucket =
    env.VITE_FIREBASE_STORAGE_BUCKET ||
    env.FIREBASE_STORAGE_BUCKET ||
    env.VITE_STORAGE_BUCKET ||
    env.STORAGE_BUCKET;

  const envMessagingSenderId =
    env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    env.FIREBASE_MESSAGING_SENDER_ID ||
    env.VITE_MESSAGING_SENDER_ID ||
    env.MESSAGING_SENDER_ID;

  const envDatabaseId =
    env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
    env.VITE_FIRESTORE_DATABASE_ID ||
    env.VITE_FIREBASE_DATABASE_ID ||
    env.VITE_FIREBASE_ID ||
    env.VITE_DATABASE_ID ||
    env.FIRESTORE_DATABASE_ID ||
    env.DATABASE_ID;

  if (envApiKey || envProjectId || envDatabaseId) {
    console.log('Firebase initialized with custom VITE_ environment variables. Project:', envProjectId || fallbackAppletConfig.projectId);
    const projectId = envProjectId || fallbackAppletConfig.projectId;
    return {
      apiKey: envApiKey || fallbackAppletConfig.apiKey,
      projectId,
      authDomain: envAuthDomain || (projectId ? `${projectId}.firebaseapp.com` : fallbackAppletConfig.authDomain),
      firestoreDatabaseId: envDatabaseId || (envProjectId ? '(default)' : fallbackAppletConfig.firestoreDatabaseId) || '(default)',
      storageBucket: envStorageBucket || (projectId ? `${projectId}.firebasestorage.app` : fallbackAppletConfig.storageBucket),
      messagingSenderId: envMessagingSenderId || fallbackAppletConfig.messagingSenderId,
      appId: envAppId || fallbackAppletConfig.appId,
    };
  }

  // 3. Fallback to firebase-applet-config.json
  return fallbackAppletConfig;
}

export const activeFirebaseConfig = resolveFirebaseConfig();
export const app = getApps().length === 0 ? initializeApp(activeFirebaseConfig) : getApp();

// Initialize Firestore using specified databaseId or default
export const db = activeFirebaseConfig.firestoreDatabaseId && activeFirebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, activeFirebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or network restricted.');
      return false;
    }
    // Expected to fail permission-check on unconfigured test path, but verifies connection
    return true;
  }
}

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function registerWithEmail(email: string, password: string, displayName?: string) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (displayName && displayName.trim() && cred.user) {
    try {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    } catch (e) {
      console.warn('Failed to update displayName on user profile:', e);
    }
  }
  return cred;
}

export async function sendPasswordReset(email: string) {
  return sendPasswordResetEmail(auth, email.trim());
}

export async function signOutUser() {
  return firebaseSignOut(auth);
}

export function formatAuthError(err: any): string {
  if (!err) return 'An unexpected error occurred. Please try again.';
  const code = err.code || '';
  const message = err.message || '';

  if (code === 'auth/operation-not-allowed' || message.includes('auth/operation-not-allowed') || message.includes('operation-not-allowed')) {
    return 'Email/Password sign-up is not enabled in your Firebase Authentication console. You can sign in immediately using Google, or enable the Email/Password provider under Authentication > Sign-in method in your Firebase console.';
  }

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Invalid email or password. If you have not created an account on this Firebase database yet, click Register below to set up your account.';
    case 'auth/user-not-found':
      return 'No account exists with this email address. Please sign up.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact an administrator.';
    case 'auth/too-many-requests':
      return 'Too many unsuccessful attempts. Access temporarily blocked; please try again later or reset password.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completion.';
    default:
      return err.message || 'Authentication failed. Please try again.';
  }
}

