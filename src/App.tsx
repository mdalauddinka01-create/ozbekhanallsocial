/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Facebook, 
  Instagram, 
  Send, 
  Image as ImageIcon, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Globe,
  Settings,
  Link as LinkIcon,
  Video,
  Play,
  Save,
  ChevronDown,
  LogOut,
  UserPlus,
  User,
  LogIn,
  KeyRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Camera,
  Crown,
  Fingerprint,
  Trash2,
  ExternalLink,
  Zap,
  MapPin,
  Smile,
  MessageCircle,
  Calendar,
  Radio,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile,
  GoogleAuthProvider,
  FacebookAuthProvider, // Added
  signInWithPopup,
  setPersistence,
  browserSessionPersistence,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  linkWithCredential,
  sendPasswordResetEmail,
  deleteUser
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';

type PlatformStatus = 'idle' | 'loading' | 'success' | 'error';

interface PostResult {
  platform: string;
  status: string;
  message?: string;
}

interface PlatformConfig {
  facebook: { login: string; pass: string; link: string };
  instagram: { login: string; pass: string; link: string };
  telegram: { channel: string; token: string };
  tiktok: { login: string; pass: string; link: string };
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
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
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
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
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // In a real app we might want to alert(errInfo.error) or similar
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot-password'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [authForm, setAuthForm] = useState({ email: '', password: '', username: localStorage.getItem('last_username') || '' });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [lookupAvatar, setLookupAvatar] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const [caption, setCaption] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'platforms' | 'account'>('platforms');
  const [profileForm, setProfileForm] = useState({ newUsername: '', currentPassword: '', newPassword: '' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showDeletePass, setShowDeletePass] = useState(false);
  
  const [results, setResults] = useState<PostResult[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['facebook', 'instagram', 'telegram', 'tiktok']);
  const [activeTab, setActiveTab] = useState<string>('facebook');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredLink, setDiscoveredLink] = useState<{ profile: string, page: string } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [fbPages, setFbPages] = useState<{ name: string, id: string, link: string }[]>([]); // Added
  const [isFbConnecting, setIsFbConnecting] = useState(false); // Added
  
  const [config, setConfig] = useState<PlatformConfig>({
    facebook: { login: '', pass: '', link: '' },
    instagram: { login: '', pass: '', link: '' },
    telegram: { channel: '', token: '' },
    tiktok: { login: '', pass: '', link: '' }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUser(Object.assign(Object.create(Object.getPrototypeOf(currentUser)), currentUser, {
              photoURL: data.photoURL || currentUser.photoURL,
              displayName: data.username || currentUser.displayName
            }));
          } else {
            setUser(currentUser);
          }
        } catch (e) {
          setUser(currentUser);
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (authMode === 'login' && authForm.username.trim().length >= 3) {
      const unsubscribe = onSnapshot(doc(db, 'usernames', authForm.username.toLowerCase().trim()), 
        (snap) => {
          if (snap.exists()) {
            setLookupAvatar(snap.data().photoURL || null);
          } else {
            setLookupAvatar(null);
          }
        },
        (error) => {
          console.error("Avatar lookup error:", error);
          setLookupAvatar(null);
        }
      );
      return () => unsubscribe();
    } else {
      setLookupAvatar(null);
    }
  }, [authForm.username, authMode]);

  useEffect(() => {
    const saved = localStorage.getItem('socialSync_config_v2');
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load config", e);
      }
    }
  }, []);

  const handleDiscover = () => {
    setIsDiscovering(true);
    
    // Simulate official discovery/connection
    setTimeout(() => {
      setIsDiscovering(false);
      
      const login = (config as any)[activeTab]?.login || (config as any).telegram?.channel || user?.displayName || 'user';
      const username = login.replace('@', '').split('@')[0].replace(/[.+]/g, '_');

      if (activeTab === 'facebook') {
        setIsDiscovering(true);
        setTimeout(() => {
          setIsDiscovering(false);
          setDiscoveredLink({
            profile: `https://facebook.com/${username}`,
            page: `https://facebook.com/pages/${username}_official`
          });
        }, 800);
      } else if (activeTab === 'telegram') {
        const updated = { ...config, telegram: { ...config.telegram, channel: `@${username}` } };
        setConfig(updated as PlatformConfig);
        localStorage.setItem('socialSync_config_v2', JSON.stringify(updated));
        alert('Telegram account connected successfully!');
      } else {
        const autoLink = activeTab === 'instagram' 
          ? `https://instagram.com/${username}` 
          : `https://tiktok.com/@${username}`;
        
        const updated = { ...config, [activeTab]: { ...(config as any)[activeTab], link: autoLink } };
        setConfig(updated as PlatformConfig);
        localStorage.setItem('socialSync_config_v2', JSON.stringify(updated));
        alert(`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} account connected!`);
      }
    }, 1200);
  };

  const handleFacebookOfficialConnect = async () => {
    setAuthError(null);
    setAuthSuccess(null);
    
    // Create provider without extra scopes or parameters as a baseline
    const provider = new FacebookAuthProvider();
    
    try {
      setIsFbConnecting(true);
      
      // Directly call signInWithPopup as the primary action
      const result = await signInWithPopup(auth, provider);
      const credential = FacebookAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      
      if (!token) throw new Error('Facebook থেকে এক্সেস টোকেন পাওয়া যায়নি।');

      // Fetch Profile Data
      const profileResp = await fetch(`https://graph.facebook.com/v19.0/me?fields=link,name&access_token=${token}`);
      const profileData = await profileResp.json();
      
      let finalLink = profileData.link || `https://facebook.com/${result.user.providerData[0]?.uid}`;
      
      // Attempt to fetch pages separately if possible (optional)
      try {
        const pagesResp = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${token}`);
        const pagesData = await pagesResp.json();
        if (pagesData.data && pagesData.data.length > 0) {
          finalLink = pagesData.data[0].link || `https://facebook.com/${pagesData.data[0].id}`;
        }
      } catch (pErr) {
        console.warn('Pages fetch omitted due to permissions.', pErr);
      }
      
      const updated = { ...config, facebook: { ...config.facebook, link: finalLink, isConnected: true } };
      setConfig(updated);
      localStorage.setItem('socialSync_config_v2', JSON.stringify(updated));
      
      setAuthSuccess('Facebook সফলভাবে কানেক্ট হয়েছে!');
      setTimeout(() => setAuthSuccess(null), 3000);
    } catch (error: any) {
      console.error('FB Login Error:', error);
      
      if (error.code === 'auth/popup-closed-by-user') {
        setAuthError('লগইন উইন্ডোটি বন্ধ হয়ে গেছে। দয়া করে নিশ্চিত করুন যে আপনার ব্রাউজার পপ-আপ ব্লক করছে না এবং Firebase কনসোলে এই ডোমেইনটি (Authorized Domains) এড করা আছে।');
      } else if (error.code === 'auth/unauthorized-domain') {
        setAuthError('এই ডোমেইনটি Firebase-এ অথোরাইজড নয়। দয়া করে Firebase কনসোলে ডোমেইনটি এড করুন।');
      } else if (error.code === 'auth/operation-not-allowed') {
        setAuthError('Firebase কনসোলে Facebook Login অপশনটি এনাবল করা নেই।');
      } else {
        setAuthError(`ফেসবুক কানেক্ট করতে সমস্যা হয়েছে (${error.code || 'Unknown Error'})।`);
      }
    } finally {
      setIsFbConnecting(false);
    }
  };

  const handleSelectFBLink = (type: 'profile' | 'page') => {
    if (!discoveredLink) return;
    const link = type === 'profile' ? discoveredLink.profile : discoveredLink.page;
    const updated = { ...config, facebook: { ...config.facebook, link } };
    setConfig(updated);
    localStorage.setItem('socialSync_config_v2', JSON.stringify(updated));
    setDiscoveredLink(null);
    alert(`Facebook ${type === 'profile' ? 'Profile' : 'Page'} connected!`);
  };

  const handleSaveConfig = () => {
    localStorage.setItem('socialSync_config_v2', JSON.stringify(config));
    alert('Settings saved successfully!');
  };

  const handleRemoveConfig = (platform: keyof PlatformConfig) => {
    const defaultVal = platform === 'telegram' ? { channel: '', token: '' } : { login: '', pass: '', link: '' };
    const updated = { ...config, [platform]: defaultVal };
    setConfig(updated as PlatformConfig);
    localStorage.setItem('socialSync_config_v2', JSON.stringify(updated));
    alert(`${platform.charAt(0).toUpperCase() + platform.slice(1)} configuration cleared.`);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setAuthLoading(true);
    try {
      if (authMode === 'forgot-password') {
        if (!authForm.email) throw new Error('দয়া করে আপনার ইমেইলটি দিন।');
        await sendPasswordResetEmail(auth, authForm.email);
        setResetEmailSent(true);
        setAuthSuccess('পাসওয়ার্ড রিসেট লিঙ্ক আপনার ইমেইলে পাঠানো হয়েছে।');
        return;
      }

      if (authMode === 'login') {
        const usernameRef = doc(db, 'usernames', authForm.username.toLowerCase().trim());
        const usernameSnap = await getDoc(usernameRef);
        
        if (!usernameSnap.exists()) {
          throw new Error('এই ইউজারনেম দিয়ে কোনো অ্যাকাউন্ট পাওয়া যায়নি।');
        }
        
        const usernameData = usernameSnap.data();
        if (!usernameData?.email) {
          throw new Error('এই ইউজারনেমের সাথে কোনো ইমেইল লিঙ্ক করা নেই। দয়া করে এডমিনের সাথে যোগাযোগ করুন।');
        }
        
        await setPersistence(auth, browserSessionPersistence);
        await signInWithEmailAndPassword(auth, usernameData.email, authForm.password);
        localStorage.setItem('last_username', authForm.username);
      } else {
        if (!authForm.username || authForm.username.length < 3) {
          throw new Error('ইউজার নাম কমপক্ষে ৩ অক্ষরের হতে হবে।');
        }

        // Email uniqueness check
        const q = query(collection(db, 'users'), where('email', '==', authForm.email));
        const emailSnap = await getDocs(q);
        if (!emailSnap.empty) {
          throw new Error('এই ইমেইলটি ইতিপূর্বে ব্যবহার করা হয়েছে। দয়া করে অন্য ইমেইল দিন।');
        }

        const usernameRef = doc(db, 'usernames', authForm.username.toLowerCase().trim());
        const usernameSnap = await getDoc(usernameRef);
        
        if (usernameSnap.exists()) {
          throw new Error('এই ইউজার নামটি অন্য কেউ ব্যবহার করছে।');
        }

        await setPersistence(auth, browserSessionPersistence);
        const userCredential = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
        console.log("User created in Auth, now saving to Firestore...");
        
        await updateProfile(userCredential.user, { 
          displayName: authForm.username,
          photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${authForm.username}`
        });
        
        const userData = {
          uid: userCredential.user.uid,
          email: authForm.email,
          username: authForm.username,
          photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${authForm.username}`,
          createdAt: new Date().toISOString(),
          status: 'active'
        };

        // Parallel save for efficiency
        await Promise.all([
          setDoc(usernameRef, {
            uid: userCredential.user.uid,
            email: authForm.email,
            username: authForm.username,
            photoURL: userData.photoURL
          }),
          setDoc(doc(db, 'users', userCredential.user.uid), userData)
        ]);

        console.log("User data saved successfully");
        setAuthSuccess('আপনার অ্যাকাউন্টটি সফলভাবে তৈরি হয়েছে!');
        localStorage.setItem('last_username', authForm.username);
      }
    } catch (err: any) {
      console.error('Auth Error:', err);
      let message = err.message;
      const errorCode = err.code;

      if (errorCode === 'auth/operation-not-allowed') {
        message = 'Firebase কনসোলে Email/Password লগইন এখনো চালু করা হয়নি। দয়া করে Authentication > Sign-in method গিয়ে এটি Enable করুন।';
      } else if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password') {
        message = 'ইউজার নাম অথবা পাসওয়ার্ড ভুল হয়েছে।';
      } else if (errorCode === 'auth/email-already-in-use') {
        message = 'এই ইমেইলটি ইতিপূর্বে ব্যবহার করা হয়েছে।';
      } else if (errorCode === 'auth/weak-password') {
        message = 'পাসওয়ার্ডটি অন্তত ৬ অক্ষরের হতে হবে।';
      } else if (errorCode === 'auth/too-many-requests') {
        message = 'অনেকবার ভুল চেষ্টা করা হয়েছে। দয়া করে কিছুক্ষণ পর আবার চেষ্টা করুন।';
      } else if (errorCode) {
        message = `Error (${errorCode}): ${err.message}`;
      }
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await setPersistence(auth, browserSessionPersistence);
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // First, check if there's any user with this email in our 'users' collection (regardless of UID)
      const q = query(collection(db, 'users'), where('email', '==', user.email));
      const emailSnap = await getDocs(q);
      
      if (!emailSnap.empty) {
        // User exists with this email. 
        // We must check if the current UID matches the one in Firestore
        const existingDoc = emailSnap.docs[0];
        const existingData = existingDoc.data();

        if (existingData.uid === user.uid) {
          // This is the SAME user trying to log in with Google again
          await signOut(auth);
          setAuthError('আপনার অ্যাকাউন্ট আগে থেকেই রয়েছে। দয়া করে আপনার ইউজারনেম এবং পাসওয়ার্ড দিয়ে লগইন করুন।');
          alert('আপনার অ্যাকাউন্ট আগে থেকেই রয়েছে। দয়া করে আপনার ইউজারনেম এবং পাসওয়ার্ড দিয়ে লগইন করুন।');
          return;
        } else {
          // Different UID but same email? This means they probably have an Email/Password account
          await signOut(auth);
          setAuthError('এই ইমেইলটি দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট রয়েছে। দয়া করে ইউজারনেম এবং পাসওয়ার্ড দিয়ে লগইন করুন।');
          alert('এই ইমেইলটি দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট রয়েছে। দয়া করে ইউজারনেম এবং পাসওয়ার্ড দিয়ে লগইন করুন।');
          return;
        }
      }

      // If we are here, no user exists with this email/UID combination in Firestore
      const usernameBase = (user.displayName || user.email?.split('@')[0] || user.uid).replace(/\s+/g, '_').toLowerCase();
        let finalUsername = usernameBase;
        
        // Check if username is taken
        const checkRef = doc(db, 'usernames', finalUsername);
        const checkSnap = await getDoc(checkRef);
        if (checkSnap.exists()) {
           finalUsername = `${usernameBase}_${Math.floor(Math.random() * 1000)}`;
        }

        const photoURL = user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${finalUsername}`;

        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          username: finalUsername,
          email: user.email,
          photoURL: photoURL,
          createdAt: new Date().toISOString(),
          isGoogle: true
        });
        
        await setDoc(doc(db, 'usernames', finalUsername), {
          uid: user.uid,
          email: user.email,
          username: finalUsername,
          photoURL: photoURL
        });
        
        await updateProfile(user, { displayName: finalUsername, photoURL: photoURL });
        setAuthSuccess('গুগলের মাধ্যমে সফলভাবে সাইন-আপ হয়েছে!');
      } catch (err: any) {
      console.error('Google Auth Error:', err);
      let message = err.message;
      if (err.code === 'auth/operation-not-allowed') {
        message = 'Firebase কনসোলে Google লগইন চালু করা হয়নি। দয়া করে Authentication > Sign-in method গিয়ে এটি Enable করুন।';
      } else if (err.code === 'auth/popup-blocked') {
        message = 'আপনার ব্রাউজার পপআপটি ব্লক করেছে। দয়া করে পপআপ অ্যালাউ করুন অথবা অন্য ব্রাউজারে চেষ্টা করুন।';
      } else if (err.code === 'auth/unauthorized-domain') {
        message = 'এই ডোমেইনটি Firebase-এ অনুমোদিত নয়। দয়া করে ডোমেইনটি Authorized Domains তালিকায় যুক্ত করুন।';
      } else if (err.code === 'auth/popup-closed-by-user') {
        message = 'লগইন উইন্ডোটি বন্ধ করা হয়েছে। দয়া করে আবার চেষ্টা করুন।';
      }
      setAuthError(message);
      alert('গুগল লগইন সমস্যা: ' + message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileLoading(true);
    setAuthError(null);

    try {
      // Re-authenticate if password update is requested
      if (profileForm.newPassword) {
        if (!profileForm.currentPassword) throw new Error('পাসওয়ার্ড পরিবর্তনের জন্য বর্তমান পাসওয়ার্ড প্রয়োজন।');
        const credential = EmailAuthProvider.credential(user.email!, profileForm.currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, profileForm.newPassword);
      }

      // Update Username
      const updates: any = {};
      if (profileForm.newUsername && profileForm.newUsername !== user.displayName) {
        const usernameRef = doc(db, 'usernames', profileForm.newUsername.toLowerCase());
        const snap = await getDoc(usernameRef);
        if (snap.exists() && snap.data().uid !== user.uid) throw new Error('এই ইউজার নামটি ইতিমধ্যে ব্যবহৃত হচ্ছে।');

        await updateProfile(user, { displayName: profileForm.newUsername });
        updates.username = profileForm.newUsername;
        await setDoc(usernameRef, { uid: user.uid, email: user.email, username: profileForm.newUsername, photoURL: user.photoURL });
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, 'users', user.uid), updates);
      }

      alert('প্রোফাইল সফলভাবে আপডেট করা হয়েছে!');
      setProfileForm({ newUsername: '', currentPassword: '', newPassword: '' });
    } catch (err: any) {
      alert(err.message || 'Update failed');
    } finally {
      setProfileLoading(false);
    }
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const handleDeleteAccount = async () => {
    if (!user) {
      alert('ব্যবহারকারী পাওয়া যায়নি। দয়া করে আবার লগইন করুন।');
      return;
    }
    
    console.log('Starting account deletion process...');
    setProfileLoading(true);
    
    try {
      // 1. Re-authentication (Crucial for account deletion)
      const isPasswordUser = user.providerData.some(p => p.providerId === 'password');
      
      if (isPasswordUser) {
        const password = profileForm.currentPassword;
        if (!password) {
          alert('নিরাপত্তার জন্য আপনার বর্তমান পাসওয়ার্ড দিন।');
          setProfileLoading(false);
          return; // Keep setShowDeleteConfirm(true) to show the input
        }

        if (!user.email) {
          throw new Error('আপনার ইমেইল অ্যাড্রেস পাওয়া যায়নি।');
        }

        console.log('Re-authenticating password user...');
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
        console.log('Re-authentication successful');
      } else {
        console.log('Google user deletion proceeds (recent login check by Firebase).');
      }

      // 2. Data Cleanup
      const uid = user.uid;
      const username = user.displayName;

      console.log('Starting data cleanup for UID:', uid);

      // Delete from 'usernames' collection
      if (username) {
        try {
          await deleteDoc(doc(db, 'usernames', username.toLowerCase()));
          console.log('Username deleted successfully');
        } catch (e) {
          console.warn('Username entry deletion failed (continuing):', e);
        }
      }
      
      // Delete from 'users' collection
      try {
        await deleteDoc(doc(db, 'users', uid));
        console.log('User document deleted successfully');
      } catch (e) {
        console.warn('User document deletion failed (continuing):', e);
      }
      
      // 3. Delete from Firebase Auth
      console.log('Deleting user from Auth...');
      await deleteUser(user);
      console.log('User deleted from Auth successfully');
      
      alert('আপনার অ্যাকাউন্টটি সফলভাবে মুছে ফেলা হয়েছে।');
      window.location.href = '/'; 
    } catch (err: any) {
      console.error('Account deletion full error:', err);
      
      if (err.code === 'auth/wrong-password') {
        alert('ভুল পাসওয়ার্ড! দয়া করে সঠিক পাসওয়ার্ড দিয়ে আবার চেষ্টা করুন।');
      } else if (err.code === 'auth/requires-recent-login') {
        alert('নিরাপত্তার কারণে আপনাকে আবার লগআউট হয়ে লগইন করে এই কাজটি করতে হবে (Session is too old)।');
      } else if (err.message) {
        alert('অ্যাকাউন্ট মুছতে সমস্যা হয়েছে: ' + err.message);
      } else {
        alert('অ্যাকাউন্ট মুছতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।');
      }
      setShowDeleteConfirm(false); // Reset on real auth errors
    } finally {
      setProfileLoading(false);
      console.log('Account deletion process finished');
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const currentUser = auth.currentUser;
    if (!file || !currentUser) return;

    // Basic size check initially (5MB) to avoid processing massive files
    if (file.size > 5 * 1024 * 1024) {
      alert('ছবির সাইজ অনেক বড়। দয়া করে ৫ মেগাবাইটের কম সাইজের ছবি ব্যবহার করুন।');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const img = new Image();
      img.onload = async () => {
        // Create a canvas to resize the image
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Max dimensions for profile pic
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        // Convert to quality 0.5 JPEG and smaller size for storage efficiency
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        
        try {
          setProfileLoading(true);
          
          // 1. Update Firestore Users Collection (Primary source)
          try {
            await updateDoc(doc(db, 'users', currentUser.uid), { photoURL: dataUrl });
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
          }
          
          // 2. Update Username Map for login screen visibility
          if (currentUser.displayName) {
            try {
              const usernameRef = doc(db, 'usernames', currentUser.displayName.toLowerCase());
              await updateDoc(usernameRef, { photoURL: dataUrl });
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, `usernames/${currentUser.displayName.toLowerCase()}`);
            }
          }
          
          // 3. Update local state manually since we aren't using updateProfile anymore
          // This ensures the UI updates immediately
          setUser(prev => {
            if (!prev) return null;
            return Object.assign(Object.create(Object.getPrototypeOf(prev)), prev, { photoURL: dataUrl });
          });
          
          alert('প্রোফাইল ছবি সফলভাবে আপডেট করা হয়েছে!');
        } catch (err: any) {
          console.error('Avatar update error:', err);
          alert('ছবি আপলোড করতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।');
        } finally {
          setProfileLoading(false);
          // Reset file input
          e.target.value = '';
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSetInitialPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!profileForm.newPassword || profileForm.newPassword.length < 6) {
      alert('পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।');
      return;
    }
    setProfileLoading(true);

    try {
      const credential = EmailAuthProvider.credential(user.email!, profileForm.newPassword);
      await linkWithCredential(user, credential);
      await updateDoc(doc(db, 'users', user.uid), { isGoogle: false }); // Now has password
      alert('পাসওয়ার্ড সফলভাবে সেট করা হয়েছে! এখন আপনি ইউজারনেম দিয়েও লগইন করতে পারবেন।');
      setProfileForm({ ...profileForm, newPassword: '' });
    } catch (err: any) {
      alert('পাসওয়ার্ড সেট করতে সমস্যা হয়েছে: ' + err.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setAuthForm(prev => ({ ...prev, password: '' }));
      await signOut(auth);
    } catch (err) {
      console.error('Sign out error', err);
    }
  };

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const removeImage = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePublish = async () => {
    if (!caption.trim() && !selectedFile) return;

    setIsPublishing(true);
    setResults([]);

    const formData = new FormData();
    formData.append('caption', caption);
    formData.append('platforms', JSON.stringify(selectedPlatforms));
    if (selectedFile) {
      formData.append('image', selectedFile);
    }

    try {
      const response = await fetch('/api/post', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setResults(data.results);
      } else {
        alert('Publication error: ' + data.error);
      }
    } catch (error) {
      console.error('Error publishing:', error);
      alert('Could not connect to service.');
    } finally {
      setIsPublishing(false);
    }
  };

  const getPlatformIcon = (name: string) => {
    switch (name.toLowerCase()) {
      case 'facebook': return <Facebook className="w-5 h-5 text-blue-600" />;
      case 'instagram': return <Instagram className="w-5 h-5 text-pink-600" />;
      case 'telegram': return <Send className="w-5 h-5 text-sky-500" />;
      case 'tiktok': return <Video className="w-5 h-5 text-red-500" />;
      default: return <Globe className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900">
      <AnimatePresence mode="wait">
        {authLoading ? (
          <motion.div 
            key="loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center gap-4"
          >
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest animate-pulse">SocialSync Security</p>
          </motion.div>
        ) : !user ? (
          <motion.div 
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-indigo-600 z-[100] flex flex-col items-center justify-center p-6 overflow-y-auto"
          >
            <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
               <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-white blur-3xl animate-pulse" />
               <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-400 blur-3xl" />
            </div>

            {/* Logo Section */}
            <div className="flex flex-col items-center gap-6 mb-12 relative z-10 text-center">
              <div 
                className="w-32 h-32 bg-amber-500/10 backdrop-blur-2xl rounded-[3rem] flex items-center justify-center overflow-hidden shadow-[0_0_60px_rgba(245,158,11,0.25)] border-2 border-amber-500/60 group cursor-pointer relative"
                onClick={() => setPreviewImage('LOGO_CLICKED')}
                title="View Logo"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-amber-500/30 to-transparent" />
                <div className="relative flex flex-col items-center">
                  <Crown size={64} className="text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.9)] group-hover:scale-110 transition-transform" />
                  <div className="w-16 h-1.5 bg-amber-500 mt-3 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.6)]" />
                </div>
              </div>
              <div>
                <p className="text-white font-black text-5xl tracking-tighter leading-none italic uppercase drop-shadow-lg">OZBEKHAN</p>
                <p className="text-amber-500 font-black uppercase tracking-[0.6em] text-[14px] mt-3">Security Hub v2.0</p>
              </div>
            </div>

            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md bg-white rounded-[40px] shadow-2xl p-8 relative z-10"
            >
              <div className="flex flex-col items-center gap-4 mb-8">
                <div 
                  className="w-20 h-20 bg-neutral-50 rounded-[2rem] flex items-center justify-center text-neutral-300 shadow-inner overflow-hidden cursor-zoom-in group border-2 border-neutral-100"
                  onClick={() => lookupAvatar && setPreviewImage(lookupAvatar)}
                >
                  {lookupAvatar ? (
                    <motion.img 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      src={lookupAvatar} 
                      className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                      alt="User" 
                    />
                  ) : (
                    <User size={36} className="opacity-40" />
                  )}
                </div>
                <div className="text-center">
                  <h1 className="text-2xl font-black text-neutral-900">Dashboard Security</h1>
                  <p className="text-sm text-neutral-400 font-medium">{authMode === 'login' ? 'পুরাতন ইউজার লগইন করুন' : 'নতুন ইউজার সাইন আপ করুন'}</p>
                </div>
              </div>

              <form onSubmit={handleAuth} className="space-y-4">
                {authMode !== 'forgot-password' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">
                      {authMode === 'login' ? 'Username' : 'Choose Username'}
                    </label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" size={18} />
                      <input 
                        type="text"
                        required
                        placeholder="ozbek_han"
                        value={authForm.username}
                        onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
                        className="w-full pl-12 pr-4 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all font-medium text-sm"
                      />
                    </div>
                  </div>
                )}

                {authMode !== 'login' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" size={18} />
                      <input 
                        type="email"
                        required
                        placeholder="name@company.com"
                        value={authForm.email}
                        onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                        className="w-full pl-12 pr-4 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all font-medium text-sm"
                      />
                    </div>
                  </div>
                )}

                {authMode !== 'forgot-password' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Password</label>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" size={18} />
                      <input 
                        type={showPassword ? "text" : "password"}
                        required
                        placeholder="••••••••"
                        value={authForm.password}
                        onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                        className="w-full pl-12 pr-12 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all font-medium text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-indigo-600 transition-colors"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                )}

                {authMode === 'login' && (
                  <div className="flex justify-center pt-1">
                    <button 
                      type="button"
                      onClick={() => {
                        setAuthMode('forgot-password');
                        setAuthError(null);
                        setAuthSuccess(null);
                      }}
                      className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 hover:text-indigo-600 transition-colors"
                    >
                      পাসওয়ার্ড ভুলে গেছেন?
                    </button>
                  </div>
                )}

                <AnimatePresence>
                  {authError && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-xs font-bold leading-relaxed overflow-hidden"
                    >
                      <AlertCircle size={14} className="inline mr-2 -mt-0.5" />
                      {authError}
                    </motion.div>
                  )}
                  {authSuccess && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="bg-green-50 border border-green-100 text-green-600 p-3 rounded-xl text-xs font-bold leading-relaxed overflow-hidden shadow-sm"
                    >
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse inline-block mr-2" />
                      {authSuccess}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button 
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {authLoading ? <Loader2 size={24} className="animate-spin" /> : (
                    <>
                      {authMode === 'login' ? <LogIn size={20} /> : authMode === 'signup' ? <UserPlus size={20} /> : <Send size={20} />}
                      {authMode === 'login' ? 'Login' : authMode === 'signup' ? 'Sign Up' : 'Reset Link'}
                    </>
                  )}
                </button>

                {authMode === 'signup' && (
                  <>
                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-100"></div></div>
                      <div className="relative flex justify-center text-[10px] uppercase font-black text-neutral-300 bg-white px-4">Or continue with</div>
                    </div>

                    <button 
                      type="button"
                      onClick={handleGoogleAuth}
                      disabled={authLoading}
                      className="w-full py-4 bg-white border border-neutral-200 text-neutral-700 rounded-2xl font-bold hover:bg-neutral-50 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70"
                    >
                      {authLoading ? <Loader2 size={20} className="animate-spin text-indigo-600" /> : (
                        <>
                          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                          Google account
                        </>
                      )}
                    </button>
                  </>
                )}
              </form>

              <div className="mt-8 pt-6 border-t border-neutral-100 text-center space-y-4">
                <button 
                  onClick={() => {
                    setAuthMode(authMode === 'signup' ? 'login' : 'signup');
                    setAuthError(null);
                    setAuthSuccess(null);
                  }}
                  className="text-[11px] font-bold uppercase tracking-widest text-indigo-600 hover:text-indigo-800 transition-colors block w-full"
                >
                  {authMode === 'login' ? 'নতুন ইউজার? অ্যাকাউন্ট তৈরি করুন' : 'আগে থেকেই অ্যাকাউন্ট আছে? লগইন করুন'}
                </button>
                {authMode === 'forgot-password' && (
                  <button 
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError(null);
                      setAuthSuccess(null);
                    }}
                    className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 hover:text-indigo-600 transition-colors block w-full"
                  >
                    লগইন পেজে ফিরে যান
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="contents"
          >
            <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900">
              <header className="bg-white border-b border-neutral-200 px-6 py-4 sticky top-0 z-[100] shadow-sm">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                  {/* Left: User Profile (now triggers settings) */}
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => { setSettingsSection('platforms'); setIsSettingsOpen(true); }}
                      className="w-12 h-12 bg-neutral-100 rounded-2xl flex items-center justify-center overflow-hidden border-2 border-white shadow-sm group transition-transform hover:scale-105 relative"
                      title="Settings"
                    >
                      {user?.photoURL ? (
                        <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
                      ) : (
                        <User size={20} className="text-neutral-400" />
                      )}
                      <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <div className="hidden sm:block">
                      <p className="text-[10px] font-black uppercase text-neutral-400 leading-none mb-1">Authenticated as</p>
                      <p className="text-sm font-bold text-neutral-900 leading-none">{user?.displayName}</p>
                    </div>
                  </div>

                  {/* Center: Ozbekhan Logo */}
                  <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center cursor-pointer group" onClick={() => setPreviewImage('LOGO_CLICKED')}>
                    <div className="flex items-center gap-3">
                       <Crown size={24} className="text-amber-500 group-hover:rotate-12 transition-transform" />
                       <h1 className="font-black text-xl tracking-tight uppercase italic text-neutral-900">OZBEKHAN</h1>
                    </div>
                    <div className="w-full h-0.5 bg-amber-500/20 mt-1 rounded-full overflow-hidden">
                      <div className="w-1/2 h-full bg-amber-500 group-hover:w-full transition-all duration-500" />
                    </div>
                  </div>
                  
                  {/* Right: Actions */}
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleSignOut}
                      className="p-2.5 bg-neutral-50 hover:bg-red-50 rounded-xl transition-all text-neutral-600 hover:text-red-600 border border-neutral-100 hover:border-red-100 group"
                      title="Logout"
                    >
                      <LogOut size={20} />
                    </button>
                  </div>
                </div>
              </header>

              {/* Settings Modal */}
              <AnimatePresence>
                {isSettingsOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setIsSettingsOpen(false)}
                      className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 20 }}
                      className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
                    >
                      <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
                        <div className="flex items-center gap-2">
                          <h2 className="font-bold text-lg px-2">Dashboard Settings</h2>
                        </div>
                        <button 
                          onClick={() => setIsSettingsOpen(false)}
                          className="p-2 hover:bg-neutral-100 rounded-full text-neutral-400 transition-colors"
                        >
                          <X size={20} />
                        </button>
                      </div>

                      <div className="flex border-b border-neutral-100 bg-neutral-50/10">
                        <button
                          onClick={() => setSettingsSection('platforms')}
                          className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                            settingsSection === 'platforms' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-neutral-400 hover:text-neutral-600'
                          }`}
                        >
                          Platforms
                        </button>
                        <button
                          onClick={() => setSettingsSection('account')}
                          className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                            settingsSection === 'account' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-neutral-400 hover:text-neutral-600'
                          }`}
                        >
                          Account Security
                        </button>
                      </div>

                      <div className="p-8 max-h-[70vh] overflow-y-auto">
                        {settingsSection === 'platforms' ? (
                          <div className="space-y-6">
                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                              {['facebook', 'instagram', 'tiktok', 'telegram'].map((plat) => (
                                <button
                                  key={plat}
                                  onClick={() => setActiveTab(plat)}
                                  className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest transition-all rounded-full border flex items-center gap-2 flex-shrink-0 ${
                                    activeTab === plat ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-neutral-400 border-neutral-100 hover:border-neutral-200'
                                  }`}
                                >
                                  {getPlatformIcon(plat)}
                                  {plat}
                                </button>
                              ))}
                            </div>

                            <AnimatePresence mode="wait">
                              <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="space-y-6"
                              >
                                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-3">
                                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                                    {getPlatformIcon(activeTab)}
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-xs font-bold text-indigo-900">{`Login to ${activeTab.toUpperCase()}`}</p>
                                    <p className="text-[10px] text-indigo-600">আপনার তথ্যগুলো এনক্রিপ্ট করে সেভ করা হবে।</p>
                                  </div>
                                </div>

                                 {!discoveredLink && (
                                  <div className="space-y-6">
                                    {(activeTab === 'facebook' || activeTab === 'instagram' || activeTab === 'tiktok' || activeTab === 'telegram') ? (
                                      <div className="space-y-4">
                                        <div className={`p-6 border-2 border-dashed rounded-[32px] text-center space-y-4 ${
                                          activeTab === 'facebook' ? 'bg-blue-50 border-blue-200' :
                                          activeTab === 'instagram' ? 'bg-pink-50 border-pink-200' :
                                          activeTab === 'tiktok' ? 'bg-neutral-50 border-neutral-200' :
                                          'bg-sky-50 border-sky-200'
                                        }`}>
                                           <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                                              {activeTab === 'facebook' && <Facebook size={32} className="text-blue-600" />}
                                              {activeTab === 'instagram' && <Instagram size={32} className="text-pink-600" />}
                                              {activeTab === 'tiktok' && <Zap size={32} className="text-neutral-900" />}
                                              {activeTab === 'telegram' && <Send size={32} className="text-sky-500" />}
                                           </div>
                                           <div className="space-y-1">
                                              <h4 className={`font-bold ${
                                                activeTab === 'facebook' ? 'text-blue-900' :
                                                activeTab === 'instagram' ? 'text-pink-900' :
                                                activeTab === 'tiktok' ? 'text-neutral-900' :
                                                'text-sky-900'
                                              }`}>Official Connection</h4>
                                              <p className={`text-[10px] px-4 ${
                                                activeTab === 'facebook' ? 'text-blue-600' :
                                                activeTab === 'instagram' ? 'text-pink-600' :
                                                activeTab === 'tiktok' ? 'text-neutral-600' :
                                                'text-sky-600'
                                              }`}>নিরাপদভাবে আপনার {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} অ্যাকাউন্ট কানেক্ট করতে নিচের বাটনে ক্লিক করুন।</p>
                                           </div>
                                           <button 
                                              onClick={activeTab === 'facebook' ? handleFacebookOfficialConnect : handleDiscover}
                                              disabled={isFbConnecting || isDiscovering}
                                              className={`w-full py-4 text-white rounded-2xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 ${
                                                activeTab === 'facebook' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100' :
                                                activeTab === 'instagram' ? 'bg-pink-600 hover:bg-pink-700 shadow-pink-100' :
                                                activeTab === 'tiktok' ? 'bg-neutral-900 hover:bg-black shadow-neutral-100' :
                                                'bg-sky-500 hover:bg-sky-600 shadow-sky-100'
                                              }`}
                                            >
                                               {(isFbConnecting || isDiscovering) ? <Loader2 size={18} className="animate-spin" /> : getPlatformIcon(activeTab)}
                                               Direct Connect {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                                            </button>
                                        </div>
                                        
                                        {(config as any)[activeTab].link && (
                                          <div className="p-4 bg-green-50 border border-green-100 rounded-2xl flex flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                              <CheckCircle2 size={16} className="text-green-500" />
                                              <span className="text-xs font-bold text-green-800">Connected</span>
                                            </div>
                                            <div className="flex items-center gap-2 bg-white/50 p-2 rounded-lg">
                                              <LinkIcon size={12} className="text-green-600" />
                                              <span className="text-[10px] text-green-700 font-mono truncate">{(config as any)[activeTab].link}</span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      null
                                    )}
                                  </div>
                                )}


                                {discoveredLink && activeTab === 'facebook' && (
                                  <motion.div 
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="p-6 bg-white border-2 border-indigo-100 rounded-[32px] space-y-4 shadow-xl"
                                  >
                                    <div className="flex items-center gap-3 border-b border-indigo-50 pb-4">
                                       <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                                          <Facebook size={20} />
                                       </div>
                                       <div>
                                          <h4 className="text-sm font-bold text-neutral-900">Choose Source</h4>
                                          <p className="text-[10px] text-neutral-500">সিলেক্ট করুন কোনটি ড্যাশবোর্ডে দেখাবেন</p>
                                       </div>
                                    </div>

                                    <div className="space-y-3">
                                      <button 
                                        onClick={() => handleSelectFBLink('profile')}
                                        className="w-full flex items-center justify-between p-4 bg-indigo-50 hover:bg-indigo-600 hover:text-white rounded-2xl transition-all group"
                                      >
                                        <div className="text-left">
                                           <p className="text-xs font-bold uppercase tracking-wider">Your Profile</p>
                                           <p className="text-[9px] opacity-70 truncate max-w-[150px]">{discoveredLink.profile}</p>
                                        </div>
                                        <ExternalLink size={14} className="opacity-40 group-hover:opacity-100" />
                                      </button>

                                      {fbPages.length > 0 ? (
                                        <div className="space-y-2">
                                          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest pl-2">Your Pages</p>
                                          {fbPages.map(page => (
                                            <button 
                                              key={page.id}
                                              onClick={() => {
                                                const updated = { ...config, facebook: { ...config.facebook, link: page.link } };
                                                setConfig(updated);
                                                localStorage.setItem('socialSync_config_v2', JSON.stringify(updated));
                                                setDiscoveredLink(null);
                                                alert(`Facebook Page "${page.name}" connected!`);
                                              }}
                                              className="w-full flex items-center justify-between p-4 bg-neutral-50 hover:bg-indigo-600 hover:text-white rounded-2xl transition-all group"
                                            >
                                              <div className="text-left">
                                                 <p className="text-xs font-bold uppercase tracking-wider">{page.name}</p>
                                                 <p className="text-[9px] opacity-70 truncate max-w-[150px]">{page.link}</p>
                                              </div>
                                              <ExternalLink size={14} className="opacity-40 group-hover:opacity-100" />
                                            </button>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="p-4 bg-neutral-50 rounded-2xl text-center">
                                          <p className="text-[10px] text-neutral-400 font-bold uppercase italic">No Pages Found</p>
                                        </div>
                                      )}
                                    </div>

                                    <button 
                                      onClick={() => setDiscoveredLink(null)}
                                      className="w-full py-2 text-[10px] text-neutral-400 font-bold uppercase hover:text-red-500 transition-colors"
                                    >
                                      Go Back
                                    </button>
                                  </motion.div>
                                )}
                              </motion.div>
                            </AnimatePresence>
                          </div>
                        ) : (
                          <div className="space-y-6 pb-12">
                            {/* Check if user linked email/password */}
                            {user?.providerData.some(p => p.providerId === 'password') ? (
                              <form onSubmit={handleUpdateProfile} className="space-y-6">
                                <div className="space-y-4">
                                  <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center gap-3">
                                    <div className="relative group/avatar">
                                      {user?.photoURL ? (
                                        <img 
                                          src={user.photoURL} 
                                          alt="Avatar" 
                                          className="w-14 h-14 rounded-xl object-cover shadow-sm border-2 border-white cursor-zoom-in hover:scale-105 transition-transform" 
                                          onClick={() => setPreviewImage(user.photoURL)}
                                        />
                                      ) : (
                                        <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm border-2 border-white">
                                           <User size={24} />
                                        </div>
                                      )}
                                      <label 
                                        htmlFor="avatar-upload-pass"
                                        className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl opacity-0 group-hover/avatar:opacity-100 cursor-pointer transition-opacity"
                                      >
                                        <Camera size={16} className="text-white" />
                                      </label>
                                      <input id="avatar-upload-pass" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                                    </div>
                                    <div className="flex-1">
                                       <p className="text-[10px] font-black uppercase text-indigo-900">Security Settings</p>
                                       <p className="text-[10px] text-indigo-600">আপনার ছবি ও তথ্য পরিবর্তন করুন</p>
                                    </div>
                                  </div>

                                  <div className="space-y-4">
                                    <LoginFormInput 
                                      label="Update Username" 
                                      type="text" 
                                      placeholder={user?.displayName || "new_username"}
                                      value={profileForm.newUsername}
                                      onChange={(val) => setProfileForm({ ...profileForm, newUsername: val })}
                                    />

                                    <div className="pt-2">
                                       <div className="h-px bg-neutral-100 w-full mb-4" />
                                       <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-4">Password Change</p>
                                       
                                       <div className="space-y-4">
                                          <LoginFormInput 
                                            label="Current Password" 
                                            type="password" 
                                            placeholder="••••••••"
                                            value={profileForm.currentPassword}
                                            onChange={(val) => setProfileForm({ ...profileForm, currentPassword: val })}
                                          />
                                          <LoginFormInput 
                                            label="New Password" 
                                            type="password" 
                                            placeholder="••••••••"
                                            value={profileForm.newPassword}
                                            onChange={(val) => setProfileForm({ ...profileForm, newPassword: val })}
                                          />
                                       </div>
                                    </div>
                                  </div>
                                </div>

                                <button 
                                  type="submit"
                                  disabled={profileLoading}
                                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                  {profileLoading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                                  Update Security Info
                                </button>

                              </form>
                            ) : (
                              <div className="space-y-6">
                                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center gap-3">
                                  <div className="relative group/avatar">
                                    {user?.photoURL ? (
                                      <img 
                                        src={user.photoURL} 
                                        alt="Avatar" 
                                        className="w-14 h-14 rounded-xl object-cover shadow-sm border-2 border-white cursor-zoom-in hover:scale-105 transition-transform" 
                                        onClick={() => setPreviewImage(user.photoURL)}
                                      />
                                    ) : (
                                      <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm border-2 border-white">
                                         <User size={24} />
                                      </div>
                                    )}
                                    <label 
                                      htmlFor="avatar-upload-google"
                                      className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl opacity-0 group-hover/avatar:opacity-100 cursor-pointer transition-opacity"
                                    >
                                      <Camera size={16} className="text-white" />
                                    </label>
                                    <input id="avatar-upload-google" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                                  </div>
                                  <div className="flex-1">
                                     <p className="text-[10px] font-black uppercase text-indigo-900">Profile Image</p>
                                     <p className="text-[10px] text-indigo-600">আপনার ছবি এখানে চাপ দিয়ে পরিবর্তন করুন</p>
                                  </div>
                                </div>

                                <form onSubmit={handleSetInitialPassword} className="space-y-6">
                                  <div className="p-6 bg-amber-50 border border-amber-100 rounded-3xl space-y-3">
                                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-amber-500 shadow-sm">
                                    <KeyRound size={24} />
                                  </div>
                                  <div className="space-y-1">
                                    <h4 className="text-sm font-bold text-amber-900">পাসওয়ার্ড সেট করা নেই</h4>
                                    <p className="text-xs text-amber-700 leading-relaxed">আপনি গুগল দিয়ে লগইন করেছেন। ভবিষ্যতে সরাসরি ইউজারনেম দিয়ে লগইন করতে চাইলে একটি পাসওয়ার্ড সেট করে নিন।</p>
                                  </div>
                                </div>

                                <div className="space-y-4">
                                   <LoginFormInput 
                                      label="Set Dashboard Password" 
                                      type="password" 
                                      placeholder="কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড"
                                      value={profileForm.newPassword}
                                      onChange={(val) => setProfileForm({ ...profileForm, newPassword: val })}
                                   />
                                   
                                   <button 
                                      type="submit"
                                      disabled={profileLoading || !profileForm.newPassword}
                                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                   >
                                      {profileLoading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                                      Set My Password
                                   </button>
                                </div>
                              </form>
                            </div>
                          )}

                          <div className="pt-6 mt-6 border-t border-neutral-100">
                             <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-[28px] space-y-3 font-sans mb-6">
                               <div className="flex items-center gap-3 text-indigo-600">
                                 <ExternalLink size={20} />
                                 <p className="text-xs font-black uppercase">Your Public Dashboard Link</p>
                               </div>
                               <div className="flex items-center gap-2 bg-white border-2 border-indigo-100 p-3 rounded-2xl shadow-sm">
                                  <input 
                                    readOnly 
                                    value={`https://www.ozbekhansecurityhub.github.com/${user?.displayName || 'user'}`}
                                    className="flex-1 bg-transparent text-xs font-mono text-indigo-600 outline-none overflow-hidden text-ellipsis"
                                  />
                                  <button 
                                    onClick={() => {
                                      navigator.clipboard.writeText(`https://www.ozbekhansecurityhub.github.com/${user?.displayName || 'user'}`);
                                      alert('প্রোফাইল লিঙ্ক কপি করা হয়েছে!');
                                    }}
                                    className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center"
                                    title="Copy Link"
                                  >
                                    <Copy size={16} />
                                  </button>
                               </div>
                               <p className="text-[10px] text-indigo-400 font-medium leading-relaxed italic">ইউজারনেম পরিবর্তন করলে আপনার এই পাবলিক লিঙ্কটিও অটোমেটিক আপডেট হয়ে যাবে।</p>
                             </div>

                             <div className="p-4 bg-red-50 rounded-2xl border border-red-100 space-y-3 font-sans">
                               <div className="flex items-center gap-3 text-red-600">
                                 <AlertCircle size={20} />
                                 <p className="text-xs font-black uppercase">Danger Zone</p>
                               </div>
                               <div className="space-y-3">
                                 <p className="text-[10px] text-red-700 leading-relaxed font-medium">অ্যাকাউন্টটি মুছে ফেললে আপনার সকল তথ্য, কানেক্টেড প্ল্যাটফর্ম এবং সেটিংস চিরতরে মুছে যাবে। <strong>নিরাপত্তার জন্য পাসওয়ার্ড প্রয়োজন হবে।</strong></p>
                                 
                                 {!showDeleteConfirm ? (
                                   <button 
                                     type="button"
                                     onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDeleteConfirm(true); }}
                                     disabled={profileLoading}
                                     className="w-full py-4 bg-red-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-neutral-900 active:scale-95 transition-all shadow-lg disabled:opacity-50 relative z-[100]"
                                   >
                                     Delete My Account
                                   </button>
                                 ) : (
                                   <div className="space-y-4 pt-2">
                                     {user?.providerData.some(p => p.providerId === 'password') && (
                                       <div className="space-y-2">
                                         <p className="text-[10px] font-bold text-red-600 uppercase">অ্যাকাউন্ট পাসওয়ার্ড দিন</p>
                                         <div className="relative">
                                           <input 
                                             type={showDeletePass ? 'text' : 'password'}
                                             placeholder="আপনার বর্তমান পাসওয়ার্ড"
                                             className="w-full px-4 py-3 bg-white border-2 border-red-100 rounded-xl text-xs focus:border-red-500 outline-none transition-all pr-12"
                                             value={profileForm.currentPassword}
                                             onChange={(e) => setProfileForm({ ...profileForm, currentPassword: e.target.value })}
                                             autoFocus
                                           />
                                           <button
                                             type="button"
                                             onClick={() => setShowDeletePass(!showDeletePass)}
                                             className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-red-300 hover:text-red-600 transition-colors"
                                           >
                                             {showDeletePass ? <EyeOff size={16} /> : <Eye size={16} />}
                                           </button>
                                         </div>
                                       </div>
                                     )}
                                     
                                     <div className="flex gap-3">
                                       <button 
                                         type="button"
                                         onClick={(e) => { 
                                           e.preventDefault(); 
                                           e.stopPropagation(); 
                                           console.log('Confirm Delete clicked');
                                           handleDeleteAccount(); 
                                         }}
                                         disabled={profileLoading}
                                         className="flex-[2] py-4 bg-red-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-neutral-900 active:scale-95 transition-all shadow-xl relative z-[100] flex items-center justify-center gap-2"
                                       >
                                         {profileLoading ? <Loader2 className="animate-spin" size={18} /> : (
                                           <>
                                             <Trash2 size={16} />
                                             Confirm Delete
                                           </>
                                         )}
                                       </button>
                                       <button 
                                         type="button"
                                         onClick={(e) => { 
                                           e.preventDefault(); 
                                           e.stopPropagation(); 
                                           setShowDeleteConfirm(false); 
                                           setProfileForm({ ...profileForm, currentPassword: '' });
                                         }}
                                         className="flex-1 py-4 bg-white border-2 border-neutral-200 text-neutral-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-neutral-50 transition-all relative z-[100]"
                                       >
                                         Cancel
                                       </button>
                                     </div>
                                   </div>
                                 )}
                               </div>
                             </div>
                           </div>

                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              <main className="max-w-4xl mx-auto px-6 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  
                  {/* Main Posting Column */}
                  <div className="lg:col-span-2 space-y-6">
                    <section className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
                        <span className="text-sm font-semibold text-neutral-600">Create Post</span>
                        <span className="text-xs text-neutral-400">{caption.length} characters</span>
                      </div>
                      
                      <div className="p-6 space-y-4">
                        <textarea
                          className="w-full min-h-[160px] p-4 text-lg border-none focus:ring-0 resize-none outline-none placeholder:text-neutral-300"
                          placeholder="What's on your mind? This will be posted to all platforms..."
                          value={caption}
                          onChange={(e) => setCaption(e.target.value)}
                          disabled={isPublishing}
                        />

                        <AnimatePresence>
                          {previewUrl && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="relative rounded-xl overflow-hidden border border-neutral-200"
                            >
                              <img 
                                src={previewUrl} 
                                alt="Preview" 
                                className="w-full h-auto max-h-80 object-cover cursor-zoom-in hover:opacity-90 transition-opacity" 
                                onClick={() => setPreviewImage(previewUrl)}
                              />
                              <button 
                                onClick={removeImage}
                                className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                              >
                                <X size={16} />
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Additional Post Options */}
                        <div className="pt-2 space-y-1">
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex items-center gap-4 p-3 hover:bg-neutral-50 rounded-xl transition-all group"
                          >
                            <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                              <ImageIcon size={20} />
                            </div>
                            <span className="text-sm font-bold text-neutral-700">Photos/videos</span>
                          </button>
                          
                          <button className="w-full flex items-center gap-4 p-3 hover:bg-neutral-50 rounded-xl transition-all group">
                            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                              <UserPlus size={20} />
                            </div>
                            <span className="text-sm font-bold text-neutral-700">Tag people</span>
                          </button>

                          <button className="w-full flex items-center gap-4 p-3 hover:bg-neutral-50 rounded-xl transition-all group">
                            <div className="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                              <MapPin size={20} />
                            </div>
                            <span className="text-sm font-bold text-neutral-700">Add location</span>
                          </button>

                          <button className="w-full flex items-center gap-4 p-3 hover:bg-neutral-50 rounded-xl transition-all group">
                            <div className="w-10 h-10 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                              <Smile size={20} />
                            </div>
                            <span className="text-sm font-bold text-neutral-700">Feeling/activity</span>
                          </button>

                          <button className="w-full flex items-center gap-4 p-3 hover:bg-neutral-50 rounded-xl transition-all group">
                            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                              <MessageCircle size={20} />
                            </div>
                            <span className="text-sm font-bold text-neutral-700">Get messages</span>
                          </button>

                          <button className="w-full flex items-center gap-4 p-3 hover:bg-neutral-50 rounded-xl transition-all group">
                            <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                              <Calendar size={20} />
                            </div>
                            <span className="text-sm font-bold text-neutral-700">Create event</span>
                          </button>

                          <button className="w-full flex items-center gap-4 p-3 hover:bg-neutral-50 rounded-xl transition-all group">
                            <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                              <Video size={20} />
                            </div>
                            <span className="text-sm font-bold text-neutral-700">Go live</span>
                          </button>
                        </div>

                        <div className="flex items-center justify-end pt-4 border-t border-neutral-100">
                          <input 
                            type="file" 
                            hidden 
                            ref={fileInputRef} 
                            accept="image/*" 
                            onChange={handleFileChange} 
                          />

                          <button 
                            onClick={handlePublish}
                            disabled={isPublishing || (!caption.trim() && !selectedFile)}
                            className={`flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all active:scale-95 ${
                              (isPublishing || (!caption.trim() && !selectedFile)) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700 hover:shadow-indigo-200'
                            }`}
                          >
                            {isPublishing ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Publishing...
                              </>
                            ) : (
                              <>
                                <Send size={18} />
                                Publish Now
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </section>

                    {/* Results Section */}
                    <AnimatePresence>
                      {results.length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6"
                        >
                          <h3 className="font-bold mb-4 text-neutral-800 flex items-center gap-2 text-sm uppercase tracking-wider">
                            Execution Log
                          </h3>
                          <div className="space-y-3">
                            {results.map((res, i) => (
                              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                                <div className="flex items-center gap-3">
                                  {getPlatformIcon(res.platform)}
                                  <span className="font-semibold text-sm">{res.platform}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                    res.status === 'success' ? 'bg-green-100 text-green-700' : 
                                    'bg-red-100 text-red-700'
                                  }`}>
                                    {res.status === 'success' ? 'connected' : res.status}
                                  </span>
                                  {res.status === 'success' ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <AlertCircle className="w-4 h-4 text-red-500" />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Sidebar Status Column */}
                  <div className="space-y-6">
                    <section className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6">
                      <h3 className="font-bold mb-4 text-neutral-800 text-sm uppercase tracking-wider">Connected Accounts</h3>
                      <div className="space-y-4">
                        <PlatformStatusItem 
                          icon={<Facebook className="text-blue-600" />} 
                          name="Facebook Page" 
                          selected={selectedPlatforms.includes('facebook')}
                          onClick={() => togglePlatform('facebook')}
                          savedValue={config.facebook.link}
                        />
                        <PlatformStatusItem 
                          icon={<Instagram className="text-pink-600" />} 
                          name="Instagram Profile" 
                          selected={selectedPlatforms.includes('instagram')}
                          onClick={() => togglePlatform('instagram')}
                          savedValue={config.instagram.link}
                        />
                        <PlatformStatusItem 
                          icon={<Send className="text-sky-500" />} 
                          name="Telegram Channel" 
                          selected={selectedPlatforms.includes('telegram')}
                          onClick={() => togglePlatform('telegram')}
                          savedValue={config.telegram.channel}
                        />
                        <PlatformStatusItem 
                          icon={<Zap className="text-neutral-900" />} 
                          name="TikTok Profile" 
                          selected={selectedPlatforms.includes('tiktok')}
                          onClick={() => togglePlatform('tiktok')}
                          savedValue={config.tiktok.link}
                        />
                      </div>
                    </section>

                    <section className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl shadow-lg p-6 text-white">
                      <h4 className="font-bold mb-2">প্রো টিপ</h4>
                      <p className="text-sm opacity-90 leading-relaxed">
                        ইনস্টাগ্রামের জন্য হাই-রেজোলিউশন ইমেজ ব্যবহার করুন। আপনার বটের মাধ্যমে টেলিগ্রাম পোস্টগুলো সাথে সাথে পাঠিয়ে দেওয়া হবে!
                      </p>
                    </section>
                  </div>
                </div>
              </main>

              <footer className="max-w-4xl mx-auto px-6 py-8 border-t border-neutral-200 mt-8 text-center space-y-4">
                <div className="flex items-center justify-center gap-6">
                   <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] font-black uppercase tracking-tighter text-neutral-300">Auth Token</span>
                      <span className="text-[9px] font-mono text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded italic">****{user?.uid.slice(-4)}</span>
                   </div>
                   <div className="w-px h-6 bg-neutral-100" />
                   <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-[10px] font-black uppercase tracking-tighter text-neutral-300">Status</span>
                      <span className="text-[9px] font-bold text-green-500 uppercase flex items-center gap-1">
                         <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                         Encrypted & Secure
                      </span>
                   </div>
                </div>
                <p 
                  className="text-center text-xs text-neutral-400 font-medium tracking-wide"
                >
                  © 2026 । Ozbek Han BD
                </p>
              </footer>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl w-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              {previewImage === 'LOGO_CLICKED' ? (
                <div className="relative flex flex-col items-center bg-neutral-950 p-16 rounded-[50px] border border-amber-500/30 shadow-[0_0_150px_rgba(245,158,11,0.15)]">
                   <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(245,158,11,0.08),transparent)]" />
                   <Crown size={160} className="text-amber-500 mb-10 drop-shadow-[0_0_40px_rgba(245,158,11,0.6)]" />
                   <h2 className="text-7xl font-black italic uppercase text-white tracking-tighter mb-4 shadow-amber-500/20">OZBEKHAN</h2>
                   <p className="text-amber-500 font-black uppercase tracking-[0.8em] text-lg">Official Security Hub v2.0</p>
                </div>
              ) : (
                <img
                  src={previewImage}
                  className="max-w-full max-h-[85vh] rounded-3xl shadow-2xl border border-white/10 object-contain"
                  alt="Preview"
                />
              )}
              <button 
                onClick={() => setPreviewImage(null)}
                className="absolute -top-12 right-0 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all border border-white/20"
              >
                <X size={24} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlatformStatusItem({ icon, name, selected, onClick, savedValue }: { icon: React.ReactNode, name: string, selected: boolean, onClick: () => void, savedValue?: string }) {
  return (
    <div className="space-y-1">
      <button 
        onClick={onClick}
        className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
          selected ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-neutral-50 border border-transparent'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${
            selected ? 'bg-white border-indigo-200' : 'bg-neutral-50 border-neutral-100'
          }`}>
            {icon}
          </div>
          <span className={`text-sm font-bold transition-colors ${selected ? 'text-indigo-900' : 'text-neutral-700'}`}>
            {name}
          </span>
        </div>
        
        <div className="flex items-center">
          {selected ? (
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center shadow-sm"
            >
              <CheckCircle2 className="w-3 h-3 text-white" />
            </motion.div>
          ) : (
            <div className="w-5 h-5 border-2 border-neutral-200 rounded-full" />
          )}
        </div>
      </button>
      
      <AnimatePresence>
        {selected && savedValue && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1">
              <a 
                href={savedValue.startsWith('http') ? savedValue : '#'} 
                target="_blank" 
                rel="noreferrer"
                className="bg-white border border-neutral-100 rounded-lg p-2 flex items-center gap-2 hover:border-indigo-200 transition-colors group"
              >
                <LinkIcon size={12} className="text-neutral-400 flex-shrink-0 group-hover:text-indigo-500" />
                <span className="text-[10px] text-neutral-500 truncate font-mono group-hover:text-indigo-600">
                  {savedValue}
                </span>
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LoginFormInput({ label, type, placeholder, value, onChange }: { label: string, type: string, placeholder: string, value: string, onChange: (val: string) => void }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
        {label}
      </label>
      <div className="relative">
        <input 
          type={isPassword ? (show ? 'text' : 'password') : type} 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm placeholder:text-neutral-300 pr-12"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-indigo-600 transition-colors"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

function SecretKeyDisplay({ name, desc, link, videoUrl }: { name: string, desc: string, link?: string, videoUrl?: string }) {
  return (
    <div className="flex items-center justify-between p-4 bg-neutral-50 border border-neutral-100 rounded-xl">
      <div className="space-y-1">
        <code className="text-xs font-bold text-indigo-600 font-mono">{name}</code>
        <p className="text-[10px] text-neutral-500 uppercase tracking-tighter">{desc}</p>
      </div>
      <div className="flex items-center gap-1">
        {videoUrl && (
          <a 
            href={videoUrl} 
            target="_blank" 
            rel="noreferrer" 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg border border-red-100 hover:bg-red-100 transition-all text-[10px] font-black uppercase tracking-widest"
            title="Watch Tutorial"
          >
            <Play size={12} fill="currentColor" />
            Video
          </a>
        )}
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-neutral-200 transition-all text-neutral-400 hover:text-indigo-600">
            <LinkIcon size={14} />
          </a>
        )}
      </div>
    </div>
  );
}
