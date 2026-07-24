import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCredential, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { auth as systemAuth } from "./firebase-app.js";
import { portalFirebaseConfig, portalSystemId } from "./portal-config.js";

const portalApp = getApps().find(app => app.name === "portal") || initializeApp(portalFirebaseConfig, "portal");
export const portalAuth = getAuth(portalApp);
const portalDb = getFirestore(portalApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

function normalizeEmail(value){ return String(value || "").trim().toLowerCase(); }

export async function signInThroughPortal(){
  const portalResult = await signInWithPopup(portalAuth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(portalResult);
  if(!credential) throw new Error("無法取得 Google 登入憑證，請重新登入。");

  const systemResult = await signInWithCredential(systemAuth, credential);
  const profile = await readPortalProfile(portalResult.user);
  return { user: systemResult.user, profile };
}

export async function readPortalProfile(user = portalAuth.currentUser){
  if(!user?.email) throw new Error("尚未登入 Portal。");
  const email = normalizeEmail(user.email);
  const snap = await getDoc(doc(portalDb, "portalUsers", email));
  if(!snap.exists()) throw new Error(`此帳號尚未加入入口平台：${email}`);

  const profile = { id: email, ...snap.data() };
  if(profile.enabled === false) throw new Error("此帳號已停用，請聯絡最高管理者。");

  const permissions = profile.permissions || {};
  const allowedSystems = Array.isArray(profile.allowedSystems) ? profile.allowedSystems : [];
  const allowed = profile.role === "admin" || permissions[portalSystemId] === true || allowedSystems.includes(portalSystemId);
  if(!allowed) throw new Error("您目前沒有公告系統的後台權限，請聯絡最高管理者。");
  return profile;
}

export async function ensurePortalAccess(systemUser){
  const portalUser = portalAuth.currentUser;
  if(!portalUser) throw new Error("Portal 登入狀態已失效，請重新登入。");
  if(normalizeEmail(portalUser.email) !== normalizeEmail(systemUser?.email)){
    throw new Error("Portal 與公告系統登入帳號不一致，請登出後重新登入。");
  }
  return readPortalProfile(portalUser);
}

export async function signOutEverywhere(){
  await Promise.allSettled([firebaseSignOut(systemAuth), firebaseSignOut(portalAuth)]);
}
