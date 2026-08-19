// Shared Google Drive appDataFolder sync + client-side encryption for
// Workout 3.0. Every read/write goes straight from the browser to
// www.googleapis.com — there is no backend of ours involved.
//
// Data is stored as AES-256-GCM ciphertext, keyed off a passphrase the user
// sets on first use (PBKDF2-derived, salt kept in fit-meta.json alongside the
// data). Forgetting the passphrase makes the data permanently unreadable —
// that's the point of real encryption, not a bug.

const GOOGLE_CLIENT_ID = "119940097847-6qletrqqv3hvc1330b4m9doacrlb0g2e.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const STATE_FILE = "fit-state.json";
const HISTORY_FILE = "fit-history.json";
const META_FILE = "fit-meta.json";
const KEY_CACHE = "fit3-drivekey";
const TOKEN_CACHE = "fit3-token-cache";

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let _currentUser = null;
let onAuthChange = null;
let cryptoKeyPromise = null;
let migrationSeedPromise = null;

// ---------- migration seed (one-time real-data import) ----------
function migrationSeed(){
  if(!migrationSeedPromise){
    migrationSeedPromise = fetch("migration-seed.json", { cache: "no-store" })
      .then(res => (res.ok ? res.json() : null))
      .catch(() => null);
  }
  return migrationSeedPromise;
}

// ---------- access-token cache (survives navigation within the tab) ----------
function saveTokenCache(){
  if(!accessToken){ sessionStorage.removeItem(TOKEN_CACHE); return; }
  try{
    sessionStorage.setItem(TOKEN_CACHE, JSON.stringify({ access_token: accessToken, expires_at: tokenExpiresAt, user: _currentUser }));
  }catch(e){}
}
function loadTokenCache(){
  try{
    const raw = sessionStorage.getItem(TOKEN_CACHE);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj.access_token || !obj.expires_at || Date.now() >= obj.expires_at) return null;
    return obj;
  }catch(e){ return null; }
}

// ---------- base64 <-> ArrayBuffer ----------
function bufToB64(buf){
  const bytes = new Uint8Array(buf);
  let bin = "";
  for(let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64ToBuf(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ---------- crypto ----------
async function deriveKey(passphrase, saltB64){
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64ToBuf(saltB64), iterations: 250000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
async function encryptJson(key, obj){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return JSON.stringify({ iv: bufToB64(iv.buffer), data: bufToB64(ciphertext) });
}
async function decryptJson(key, contentStr){
  const wrapper = JSON.parse(contentStr);
  const iv = new Uint8Array(b64ToBuf(wrapper.iv));
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, b64ToBuf(wrapper.data));
  return JSON.parse(new TextDecoder().decode(plainBuf));
}
async function cacheKey(key){
  const raw = await crypto.subtle.exportKey("raw", key);
  localStorage.setItem(KEY_CACHE, bufToB64(raw));
}
async function loadCachedKey(){
  const cached = localStorage.getItem(KEY_CACHE);
  if(!cached) return null;
  try{
    return await crypto.subtle.importKey("raw", b64ToBuf(cached), "AES-GCM", true, ["encrypt", "decrypt"]);
  }catch(e){
    localStorage.removeItem(KEY_CACHE);
    return null;
  }
}

// ---------- Drive REST ----------
async function ensureFreshToken(){
  if(accessToken && Date.now() < tokenExpiresAt) return true;
  return new Promise((resolve) => {
    let settled = false;
    tokenClient.callback = (resp) => {
      if(settled) return;
      settled = true;
      if(resp.error){ resolve(false); return; }
      onTokenReceived(resp).then(() => resolve(true));
    };
    tokenClient.error_callback = () => { if(!settled){ settled = true; resolve(false); } };
    try{ tokenClient.requestAccessToken({ prompt: "" }); }
    catch(e){ resolve(false); }
    setTimeout(() => { if(!settled){ settled = true; resolve(false); } }, 4000);
  });
}
async function driveFetch(path, opts, retried){
  opts = opts || {};
  const ok = await ensureFreshToken();
  if(!ok) throw new Error("not signed in");
  const res = await fetch(`https://www.googleapis.com/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${accessToken}`, ...(opts.headers || {}) },
  });
  if(res.status === 401 && !retried){
    accessToken = null;
    const refreshed = await ensureFreshToken();
    if(refreshed) return driveFetch(path, opts, true);
  }
  return res;
}
async function findFileByName(name){
  const q = encodeURIComponent(`name = '${name}' and 'appDataFolder' in parents and trashed = false`);
  const res = await driveFetch(`drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name)`);
  if(!res.ok) throw new Error("drive list failed: " + res.status);
  const j = await res.json();
  return (j.files && j.files[0]) || null;
}
async function createFile(name, contentStr){
  const boundary = "fitbnd" + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({ name, parents: ["appDataFolder"] });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${contentStr}\r\n` +
    `--${boundary}--`;
  const res = await driveFetch("upload/drive/v3/files?uploadType=multipart&fields=id,name", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if(!res.ok) throw new Error("drive create failed: " + res.status);
  return await res.json();
}
async function readFileContent(fileId){
  const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
  if(!res.ok) throw new Error("drive read failed: " + res.status);
  return await res.text();
}
async function updateFileContent(fileId, contentStr){
  const res = await driveFetch(`upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: contentStr,
  });
  if(!res.ok) throw new Error("drive update failed: " + res.status);
}
async function deleteFile(fileId){
  const res = await driveFetch(`drive/v3/files/${fileId}`, { method: "DELETE" });
  if(!res.ok && res.status !== 404) throw new Error("drive delete failed: " + res.status);
}
async function whoAmI(){
  const res = await driveFetch("drive/v3/about?fields=user");
  if(!res.ok) throw new Error("about failed: " + res.status);
  const j = await res.json();
  return { email: j.user.emailAddress, name: j.user.displayName };
}

// ---------- passphrase / key unlock ----------
async function verifyKey(key){
  const file = await findFileByName(STATE_FILE);
  if(!file) return true;
  try{
    const raw = await readFileContent(file.id);
    await decryptJson(key, raw);
    return true;
  }catch(e){ return false; }
}
async function unlockKey(){
  const cached = await loadCachedKey();
  if(cached && (await verifyKey(cached))) return cached;

  const meta = await findFileByName(META_FILE);
  let saltB64;
  const firstTime = !meta;
  if(firstTime){
    saltB64 = bufToB64(crypto.getRandomValues(new Uint8Array(16)).buffer);
  }else{
    saltB64 = JSON.parse(await readFileContent(meta.id)).salt;
  }

  for(let attempt = 0; attempt < 5; attempt++){
    const pass = firstTime
      ? prompt("Set a passphrase to encrypt your workout data.\n\nThis can NOT be reset if you forget it — write it down somewhere safe.")
      : prompt("Enter your passphrase to unlock your workout data:");
    if(pass === null) throw new Error("passphrase entry cancelled");
    if(!pass.trim()) continue;
    const key = await deriveKey(pass, saltB64);
    if(firstTime){
      await createFile(META_FILE, JSON.stringify({ salt: saltB64 }));
      await cacheKey(key);
      return key;
    }
    if(await verifyKey(key)){
      await cacheKey(key);
      return key;
    }
    alert("Wrong passphrase — try again.");
  }
  throw new Error("too many failed passphrase attempts");
}
function ensureKey(){
  if(!cryptoKeyPromise){
    cryptoKeyPromise = unlockKey().catch((e) => { cryptoKeyPromise = null; throw e; });
  }
  return cryptoKeyPromise;
}

// ---------- public data API ----------
async function getJsonFile(name, seedFactory){
  const key = await ensureKey();
  let file = await findFileByName(name);
  if(!file){
    const seed = await seedFactory();
    const content = await encryptJson(key, seed);
    file = await createFile(name, content);
    return { fileId: file.id, data: seed, isNew: true };
  }
  const raw = await readFileContent(file.id);
  const data = await decryptJson(key, raw);
  return { fileId: file.id, data, isNew: false };
}
async function writeJsonFile(fileId, data){
  const key = await ensureKey();
  const content = await encryptJson(key, data);
  await updateFileContent(fileId, content);
}

// ---------- auth ----------
function driveUser(){ return _currentUser; }
function waitForGoogle(cb, attempt){
  attempt = attempt || 0;
  if(window.google && google.accounts && google.accounts.oauth2){ cb(); return; }
  if(attempt > 40) return;
  setTimeout(() => waitForGoogle(cb, attempt + 1), 250);
}
async function onTokenReceived(resp){
  accessToken = resp.access_token;
  tokenExpiresAt = Date.now() + (resp.expires_in * 1000 - 60000);
  try{
    _currentUser = await whoAmI();
  }catch(e){
    accessToken = null;
    _currentUser = null;
  }
  saveTokenCache();
}
function finishSignedOut(){
  accessToken = null;
  _currentUser = null;
  onAuthChange && onAuthChange();
}
function trySilentSignIn(){
  let settled = false;
  tokenClient.callback = async (resp) => {
    if(settled) return;
    settled = true;
    if(resp.error){ finishSignedOut(); return; }
    await onTokenReceived(resp);
    onAuthChange && onAuthChange();
  };
  tokenClient.error_callback = () => { if(!settled){ settled = true; finishSignedOut(); } };
  try{ tokenClient.requestAccessToken({ prompt: "" }); }
  catch(e){ finishSignedOut(); }
  setTimeout(() => { if(!settled){ settled = true; finishSignedOut(); } }, 4000);
}
function initAuth(onChange){
  onAuthChange = onChange;
  const cached = loadTokenCache();
  if(cached){
    accessToken = cached.access_token;
    tokenExpiresAt = cached.expires_at;
    _currentUser = cached.user;
  }
  waitForGoogle(() => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: () => {},
    });
    if(cached){ onAuthChange && onAuthChange(); }
    else{ trySilentSignIn(); }
  });
}
function signIn(){
  if(!tokenClient) return;
  tokenClient.callback = async (resp) => {
    if(resp.error) return;
    await onTokenReceived(resp);
    onAuthChange && onAuthChange();
  };
  tokenClient.requestAccessToken({ prompt: "consent" });
}
function signOut(cb){
  const done = () => {
    accessToken = null;
    _currentUser = null;
    cryptoKeyPromise = null;
    localStorage.removeItem(KEY_CACHE);
    sessionStorage.removeItem(TOKEN_CACHE);
    onAuthChange && onAuthChange();
    cb && cb();
  };
  if(accessToken) google.accounts.oauth2.revoke(accessToken, done);
  else done();
}
