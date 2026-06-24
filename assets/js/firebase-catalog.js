import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import {
  initializeAppCheck, ReCaptchaEnterpriseProvider
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app-check.js';
import {
  getFirestore, serverTimestamp,
  collection, doc, getDoc, setDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

const required = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const config = window.SHRISH_FIREBASE_CONFIG || {};
const missing = required.filter((key) => !config[key] || String(config[key]).includes('REPLACE_ME'));
if (missing.length) {
  console.warn('Firebase config is incomplete. Update assets/js/firebase-config.js:', missing.join(', '));
}

const app = getApps().length ? getApp() : initializeApp(config);
const appCheckSiteKey = String(window.SHRISH_APP_CONFIG?.appCheckSiteKey || '').trim();
if (appCheckSiteKey && !window.__SHRISH_APP_CHECK_READY__) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true
  });
  window.__SHRISH_APP_CHECK_READY__ = true;
}

const db = getFirestore(app);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export {
  db,
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  escapeHtml
};
