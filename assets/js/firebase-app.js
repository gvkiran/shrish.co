import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import {
  getFirestore, serverTimestamp, Timestamp,
  collection, doc, addDoc, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, limit,
  runTransaction   // â added for sequential order IDs
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
  EmailAuthProvider, reauthenticateWithCredential, updateEmail,
  verifyPasswordResetCode, confirmPasswordReset
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
import {
  getFunctions, httpsCallable
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js';

const required = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const config = window.SHRISH_FIREBASE_CONFIG || {};
const missing = required.filter((key) => !config[key] || String(config[key]).includes('REPLACE_ME'));
if (missing.length) {
  console.warn('Firebase config is incomplete. Update assets/js/firebase-config.js:', missing.join(', '));
}

const app = initializeApp(config);
const db = getFirestore(app);
const auth = getAuth(app);
const cloudFunctions = getFunctions(app, 'us-central1');

function safeText(value, fallback = 'â') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}
function moneyNumber(value) {
  const parsed = parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function formatDate(value) {
  if (!value) return 'â';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return 'â';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatDateInput(value) {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}
function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
}
function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}
function orderItemsSummary(items = []) {
  return items.map((item) => `${item.name} Ã ${item.qty}`).join(', ');
}

export {
  db, auth, cloudFunctions, httpsCallable,
  collection, doc, addDoc, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, limit,
  runTransaction,   // â exported
  onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
  EmailAuthProvider, reauthenticateWithCredential, updateEmail,
  verifyPasswordResetCode, confirmPasswordReset,
  serverTimestamp, Timestamp,
  safeText, moneyNumber, escapeHtml,
  formatDate, formatDateInput, formatCurrency,
  normalizePhone, orderItemsSummary
};
