import { db, auth } from "../../shared/js/firebase-app.js";
import { allowedAdmins, githubConfig } from "../../shared/js/firebase-config.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

console.log("MUST Resource Platform Admin v4.3 loaded");
const $ = id => document.getElementById(id);
const provider = new GoogleAuthProvider();
let announcements = [], adminKeyword = "", uploadedImages = [], uploadedFiles = [], staffUsers = [], currentUser = null, currentRole = "guest";
const builtInSuperAdmins = (allowedAdmins || []).map(normalizeEmail);

const templates = {
  activity: { category:"活動", content:"📢【活動通知】\n\n活動名稱：\n活動日期：\n活動地點：\n參加對象：\n報名方式：\n注意事項：\n聯絡窗口：" },
  scholarship: { category:"獎助學金", content:"🎓【獎助學金申請通知】\n\n申請資格：\n申請期限：\n申請方式：\n應備文件：\n注意事項：\n聯絡窗口：" },
  course: { category:"修課通知", content:"📚【修課通知】\n\n適用對象：\n重要時程：\n辦理方式：\n注意事項：\n相關連結／附件：\n聯絡窗口：" },
  general: { category:"公告", content:"📢【公告】\n\n說明：\n辦理方式：\n注意事項：\n聯絡窗口：" }
};
const aiPrompts = {
  formal:"請將以下公告內容改寫成正式、清楚、適合大學資源教室發布的公告。保留重要日期、地點、資格、附件資訊。請使用繁體中文。",
  student:"請將以下公告內容改寫成學生容易理解的白話版，語氣親切清楚，重要事項用條列呈現。請使用繁體中文。",
  line:"請將以下公告內容改寫成適合 LINE 官方帳號發布的版本，精簡、有 emoji、重點清楚。請使用繁體中文。",
  short:"請將以下公告內容濃縮成 500 字以內，保留最重要的日期、對象、方式、附件或連結。請使用繁體中文。",
  emoji:"請將以下公告內容整理得更容易閱讀，加入適量 emoji，但不要太花俏。請使用繁體中文。"
};

function normalizeEmail(email){ return String(email || "").trim().toLowerCase(); }
function roleLabel(role){ return role==="superAdmin" ? "👑 超級管理員" : role==="teacher" ? "👨‍🏫 老師" : role==="assistant" ? "📝 助理" : "未授權"; }
function isSuperAdmin(){ return currentRole === "superAdmin"; }
function canManagePosts(){ return currentRole === "superAdmin" || currentRole === "teacher"; }
function canAssistantDraft(){ return currentRole === "assistant"; }
function on(id, ev, fn){ const el=$(id); if(el) el.addEventListener(ev, fn); }

on("loginBtn","click",async()=>{
  try{ $("loginBtn").disabled=true; $("loginBtn").textContent="登入中..."; await signInWithPopup(auth,provider); }
  catch(e){ console.error(e); alert("Google 登入失敗：\n"+(e.message||e.code)); }
  finally{ $("loginBtn").disabled=false; $("loginBtn").textContent="使用 Google 登入"; }
});
on("logoutBtn","click",()=>signOut(auth));

onAuthStateChanged(auth, async user=>{
  if(!user){ $("loginView")?.classList.remove("hidden"); $("appView")?.classList.add("hidden"); return; }
  currentUser=user;
  await loadStaffUsers();
  currentRole=getRoleByEmail(user.email);
  if(currentRole==="guest"){ alert("這個帳號沒有後台權限："+user.email); signOut(auth); return; }
  $("loginView")?.classList.add("hidden"); $("appView")?.classList.remove("hidden");
  const rec=findStaffByEmail(user.email);
  $("userInfo").innerHTML=`👤 ${esc(rec?.name || user.displayName || user.email)} <span class="role-badge">${roleLabel(currentRole)}</span>`;
  if($("githubToken")) $("githubToken").value=localStorage.getItem("mrp_github_token")||"";
  if($("openaiKey")) $("openaiKey").value=localStorage.getItem("mrp_openai_key")||"";
  if($("openaiModel")) $("openaiModel").value=localStorage.getItem("mrp_openai_model")||"gpt-5.5";
  applyRoleUi(); resetForm(); listenPosts();
});

async function loadStaffUsers(){
  const ref=doc(db,"settings","admins");
  const snap=await getDoc(ref);
  staffUsers=snap.exists() ? (snap.data().users || []) : [];
  for(const email of builtInSuperAdmins){
    if(!staffUsers.some(u=>normalizeEmail(u.email)===email)){
      staffUsers.push({name:"最高管理員", email, role:"superAdmin", builtIn:true});
    }
  }
  if(currentUser && builtInSuperAdmins.includes(normalizeEmail(currentUser.email))) await saveStaffUsers(false);
  renderStaffList();
}
async function saveStaffUsers(showAlert=true){
  const normalized=[], seen=new Set();
  for(const u of staffUsers){
    const email=normalizeEmail(u.email);
    if(!email || seen.has(email)) continue;
    seen.add(email);
    normalized.push({name:u.name||email, email, role:builtInSuperAdmins.includes(email)?"superAdmin":(u.role||"teacher"), builtIn:builtInSuperAdmins.includes(email)});
  }
  staffUsers=normalized;
  await setDoc(doc(db,"settings","admins"),{
    users:staffUsers,
    superAdmins:staffUsers.filter(u=>u.role==="superAdmin").map(u=>normalizeEmail(u.email)),
    teachers:staffUsers.filter(u=>u.role==="teacher").map(u=>normalizeEmail(u.email)),
    assistants:staffUsers.filter(u=>u.role==="assistant").map(u=>normalizeEmail(u.email)),
    updatedAt:serverTimestamp()
  },{merge:true});
  renderStaffList();
  if(showAlert) alert("管理員名單已更新。");
}
function findStaffByEmail(email){ const t=normalizeEmail(email); return staffUsers.find(u=>normalizeEmail(u.email)===t); }
function getRoleByEmail(email){ const t=normalizeEmail(email); if(builtInSuperAdmins.includes(t)) return "superAdmin"; return findStaffByEmail(t)?.role || "guest"; }
function applyRoleUi(){
  $("roleManager")?.classList.toggle("hidden",!isSuperAdmin());
  $("roleManagerLocked")?.classList.toggle("hidden",isSuperAdmin());
  if(canAssistantDraft()){
    $("published").checked=false; $("published").disabled=true; $("pinned").checked=false; $("pinned").disabled=true; $("assistantHint")?.classList.remove("hidden");
  }else{
    $("published").disabled=false; $("pinned").disabled=false; $("assistantHint")?.classList.add("hidden");
  }
}
function renderStaffList(){
  const el=$("staffList"); if(!el) return;
  if(!staffUsers.length){ el.innerHTML='<div class="empty">尚未建立管理員名單</div>'; return; }
  el.innerHTML=staffUsers.map(u=>{
    const email=normalizeEmail(u.email), built=builtInSuperAdmins.includes(email);
    return `<div class="staff-card"><div class="staff-main"><div class="staff-name">${esc(u.name||email)} <span class="role-badge">${roleLabel(u.role)}</span>${built?'<span class="role-badge">內建</span>':""}</div><div class="staff-email">${esc(email)}</div></div><div class="tool-row"><button type="button" class="ghost-btn" data-edit-staff="${esc(email)}">帶入修改</button>${built?"":`<button type="button" class="ghost-btn" data-remove-staff="${esc(email)}">移除</button>`}</div></div>`;
  }).join("");
}
on("addStaffBtn","click",async()=>{
  if(!isSuperAdmin()) return alert("只有超級管理員可以新增老師。");
  const name=$("staffName").value.trim(), email=normalizeEmail($("staffEmail").value), role=$("staffRole").value;
  if(!email || !email.includes("@")) return alert("請輸入正確 Email。");
  const existing=staffUsers.find(u=>normalizeEmail(u.email)===email);
  if(existing){ existing.name=name||existing.name||email; existing.role=builtInSuperAdmins.includes(email)?"superAdmin":role; }
  else staffUsers.push({name:name||email,email,role});
  $("staffName").value=""; $("staffEmail").value=""; $("staffRole").value="teacher";
  await saveStaffUsers(true);
});

document.addEventListener("click",async e=>{
  const nav=e.target.closest(".nav-item"); if(nav) return showView(nav.dataset.view);
  const aiBtn=e.target.closest(".ai-action"); if(aiBtn) return runAi(aiBtn.dataset.ai);
  const editStaff=e.target.closest("[data-edit-staff]"); if(editStaff){ const u=findStaffByEmail(editStaff.dataset.editStaff); if(u){ $("staffName").value=u.name||""; $("staffEmail").value=normalizeEmail(u.email); $("staffRole").value=u.role||"teacher"; } return; }
  const removeStaff=e.target.closest("[data-remove-staff]"); if(removeStaff){ if(!isSuperAdmin()) return alert("只有超級管理員可以移除老師。"); const email=normalizeEmail(removeStaff.dataset.removeStaff); if(builtInSuperAdmins.includes(email)) return alert("內建最高管理員不可移除。"); if(!confirm("確定移除這位人員？\n"+email)) return; staffUsers=staffUsers.filter(u=>normalizeEmail(u.email)!==email); await saveStaffUsers(true); return; }
  const editBtn=e.target.closest("[data-edit]"); if(editBtn) return editPost(editBtn.dataset.edit);
  const delBtn=e.target.closest("[data-delete]"); if(delBtn){ if(!canManagePosts()) return alert("你的權限不能刪除公告。"); if(confirm("確定刪除這筆內容？")) await deleteDoc(doc(db,"announcements",delBtn.dataset.delete)); return; }
  const lineBtn=e.target.closest("[data-line]"); if(lineBtn) return copyLineText(lineBtn.dataset.line);
  const imgBtn=e.target.closest("[data-img]"); if(imgBtn){ uploadedImages.splice(Number(imgBtn.dataset.img),1); renderPreviews(); return; }
  const fileBtn=e.target.closest("[data-file]"); if(fileBtn){ uploadedFiles.splice(Number(fileBtn.dataset.file),1); renderPreviews(); return; }
  const delFile=e.target.closest("[data-delete-file]"); if(delFile){ const [postId,idx]=delFile.dataset.deleteFile.split("|"); return deleteAttachment(postId,idx); }
  const delAll=e.target.closest("[data-delete-all-files]"); if(delAll){ return deleteAllAttachments(delAll.dataset.deleteAllFiles); }
});

let unsubscribe=null;
function listenPosts(){
  if(unsubscribe) return;
  unsubscribe=onSnapshot(query(collection(db,"announcements"),orderBy("date","desc")),snap=>{
    announcements=snap.docs.map(d=>({id:d.id,...d.data()}));
    updateStats(); renderList(); renderRecent(); renderLibrary(); renderCapacity();
  },err=>{ console.error(err); alert("讀取公告失敗：\n"+err.message); });
}
function showView(view){
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  $("view-"+view)?.classList.remove("hidden");
  $("pageTitle").textContent={dashboard:"儀表板",posts:"公告管理",library:"附件中心",capacity:"容量管理",settings:"系統設定"}[view]||"管理平台";
  if(view==="settings") renderStaffList();
}

on("saveTokenBtn","click",()=>{ localStorage.setItem("mrp_github_token",$("githubToken").value.trim()); alert("Token 已儲存於此瀏覽器"); });
on("clearTokenBtn","click",()=>{ localStorage.removeItem("mrp_github_token"); $("githubToken").value=""; alert("已清除 Token"); });
on("saveOpenAiBtn","click",()=>{ localStorage.setItem("mrp_openai_key",$("openaiKey").value.trim()); localStorage.setItem("mrp_openai_model",$("openaiModel").value.trim()||"gpt-5.5"); alert("AI 設定已儲存於此瀏覽器"); });
on("clearOpenAiBtn","click",()=>{ localStorage.removeItem("mrp_openai_key"); localStorage.removeItem("mrp_openai_model"); $("openaiKey").value=""; $("openaiModel").value="gpt-5.5"; alert("已清除 AI 設定"); });

setupDrop("imageDrop","imageInput","image"); setupDrop("fileDrop","fileInput","file");
function setupDrop(zoneId,inputId,type){
  const zone=$(zoneId), input=$(inputId); if(!zone||!input) return;
  zone.addEventListener("click",()=>input.click());
  zone.addEventListener("dragover",e=>{e.preventDefault();zone.classList.add("dragover");});
  zone.addEventListener("dragleave",()=>zone.classList.remove("dragover"));
  zone.addEventListener("drop",e=>{e.preventDefault();zone.classList.remove("dragover");handleFiles([...e.dataTransfer.files],type);});
  input.addEventListener("change",()=>handleFiles([...input.files],type));
}
async function handleFiles(files,type){
  const token=localStorage.getItem("mrp_github_token");
  if(!token) return alert("請先到「系統設定」貼上 GitHub Token，才能拖曳上傳檔案。");
  for(const file of files){ try{ const item=await uploadToGithub(file,token,type); if(type==="image") uploadedImages.push(item); else uploadedFiles.push(item); }catch(e){ console.error(e); alert("上傳失敗："+file.name+"\n"+e.message); } }
  renderPreviews();
}
function fileToBase64(file){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result).split(",")[1]); r.onerror=reject; r.readAsDataURL(file); }); }
async function uploadToGithub(file,token,type){
  const safeName=file.name.replace(/[^\w.\-\u4e00-\u9fa5]/g,"_");
  const now=new Date(), yyyy=now.getFullYear(), mm=String(now.getMonth()+1).padStart(2,"0");
  const path=`frontend/assets/uploads/${yyyy}/${mm}/${Date.now()}_${safeName}`;
  const content=await fileToBase64(file);
  const response=await fetch(`https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${path}`,{method:"PUT",headers:{Authorization:`Bearer ${token}`,Accept:"application/vnd.github+json","Content-Type":"application/json"},body:JSON.stringify({message:`upload ${type}: ${file.name}`,content,branch:githubConfig.branch})});
  const data=await response.json(); if(!response.ok) throw new Error(data.message||"GitHub API error");
  return {name:file.name,url:path,size:file.size,type:file.type};
}
function renderPreviews(){
  $("imagePreview").innerHTML=uploadedImages.map((x,i)=>`<div class="preview-item"><img src="../${x.url}"><div>${esc(x.name)}</div><button type="button" class="remove-mini" data-img="${i}">移除</button></div>`).join("");
  $("filePreview").innerHTML=uploadedFiles.map((x,i)=>`<div class="preview-item"><strong>📎 ${esc(x.name)}</strong><br><small>${Math.round((x.size||0)/1024)} KB</small><button type="button" class="remove-mini" data-file="${i}">移除</button></div>`).join("");
}
on("refreshCapacityBtn","click",renderCapacity);
on("resetBtn","click",resetForm); on("previewBtn","click",showPreviewFromForm); on("lineBtn","click",copyLineTextFromForm);
on("closePreviewBtn","click",()=>$("previewModal").classList.add("hidden")); on("closeAiBtn","click",()=>$("aiModal").classList.add("hidden"));
on("applyAiBtn","click",()=>{ if($("aiResult").value.trim()) $("content").value=$("aiResult").value.trim(); $("aiModal").classList.add("hidden"); });
on("copyAiBtn","click",async()=>{ await navigator.clipboard.writeText($("aiResult").value); alert("已複製"); });
on("adminSearch","input",e=>{ adminKeyword=e.target.value.trim(); renderList(); });
on("templateSelect","change",e=>{ const t=templates[e.target.value]; if(!t) return; if($("content").value.trim()&&!confirm("套用模板會覆蓋目前內容，確定嗎？")) return; $("category").value=t.category; $("content").value=t.content; });

async function runAi(mode){
  const data=currentFormData(), instruction=aiPrompts[mode]||aiPrompts.formal;
  const source=`標題：${data.title}\n分類：${data.category}\n發布日期：${data.date}\n截止日期：${data.deadline||"無"}\n\n內容：\n${data.content}`;
  const prompt=`${instruction}\n\n${source}`;
  if(!data.content.trim()&&!data.title.trim()) return alert("請先輸入標題或公告內容，再使用 AI。");
  const apiKey=localStorage.getItem("mrp_openai_key")||"", model=localStorage.getItem("mrp_openai_model")||"gpt-5.5";
  if(!apiKey){ $("aiResult").value=`請幫我處理以下資源教室公告。\n\n需求：${instruction}\n\n公告內容：\n${source}`; $("aiModal").classList.remove("hidden"); try{await navigator.clipboard.writeText($("aiResult").value);}catch{} alert("尚未設定 OpenAI API Key，已改為複製 ChatGPT 提示詞。"); return; }
  try{
    $("aiResult").value="AI 產生中，請稍候..."; $("aiModal").classList.remove("hidden");
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,input:prompt})});
    const json=await response.json(); if(!response.ok) throw new Error(json.error?.message||"OpenAI API error");
    $("aiResult").value=json.output_text||extractResponseText(json)||"AI 沒有回傳文字。";
  }catch(e){ console.error(e); $("aiResult").value=`AI 呼叫失敗：${e.message}\n\n已改為提示詞模式，請複製以下內容到 ChatGPT：\n\n${prompt}`; }
}
function extractResponseText(json){ try{return json.output?.flatMap(item=>item.content||[])?.map(c=>c.text||"")?.join("\n")?.trim();}catch{return "";} }


function formatBytes(bytes){
  const n = Number(bytes || 0);
  if(n >= 1024*1024*1024) return (n/1024/1024/1024).toFixed(2)+" GB";
  if(n >= 1024*1024) return (n/1024/1024).toFixed(1)+" MB";
  if(n >= 1024) return (n/1024).toFixed(1)+" KB";
  return n+" B";
}
function fileKind(file){
  const name = (file.name || file.url || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  if(type.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(name)) return "圖片";
  if(type.includes("pdf") || /\.pdf$/i.test(name)) return "PDF";
  if(/\.(doc|docx)$/i.test(name)) return "Word";
  if(/\.(xls|xlsx|csv)$/i.test(name)) return "Excel";
  if(/\.(ppt|pptx)$/i.test(name)) return "PowerPoint";
  return "其他";
}
function fileYear(file, post){
  const url = file.url || "";
  const m = url.match(/uploads\/(\d{4})\//);
  if(m) return m[1];
  return String(post.date || "").slice(0,4) || "未分類";
}
function allFiles(){
  return announcements.flatMap(post => (post.files || []).map((file, index) => ({...file, postId:post.id, postTitle:post.title, postDate:post.date, index})));
}
function getCapacityStats(){
  const files = allFiles();
  const knownTotal = files.reduce((sum, f)=>sum + Number(f.size || 0), 0);
  const byType = {};
  const byYear = {};
  for(const f of files){
    const type = fileKind(f);
    const year = fileYear(f, {date:f.postDate});
    byType[type] = (byType[type] || 0) + Number(f.size || 0);
    byYear[year] = (byYear[year] || 0) + Number(f.size || 0);
  }
  const sortedLargest = [...files].sort((a,b)=>Number(b.size||0)-Number(a.size||0)).slice(0,10);
  return {files, knownTotal, byType, byYear, sortedLargest};
}
function capacityStatusByMb(mb){
  if(mb >= 900) return {light:"🔴", text:"容量快滿", cls:"danger"};
  if(mb >= 700) return {light:"🟡", text:"容量注意", cls:"warn"};
  return {light:"🟢", text:"容量正常", cls:"ok"};
}
async function fetchRepoSizeMb(){
  const token = localStorage.getItem("mrp_github_token") || "";
  if(!token) return null;
  const res = await fetch(`https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}`, {
    headers:{Authorization:`Bearer ${token}`, Accept:"application/vnd.github+json"}
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.message || "GitHub API error");
  return Number(data.size || 0) / 1024;
}
async function renderCapacity(){
  const stats = getCapacityStats();
  const files = stats.files;
  if($("capPostCount")) $("capPostCount").textContent = announcements.length;
  if($("capFileCount")) $("capFileCount").textContent = files.length;
  if($("capKnownSize")) $("capKnownSize").textContent = formatBytes(stats.knownTotal);
  if($("capLargestFile")) $("capLargestFile").textContent = stats.sortedLargest[0] ? formatBytes(stats.sortedLargest[0].size || 0) : "-";

  if($("typeStats")){
    const entries = Object.entries(stats.byType).sort((a,b)=>b[1]-a[1]);
    $("typeStats").innerHTML = entries.length ? entries.map(([k,v])=>`<div class="stat-line"><span>${esc(k)}</span><strong>${formatBytes(v)}</strong></div>`).join("") : '<div class="empty">目前沒有附件</div>';
  }
  if($("yearStats")){
    const entries = Object.entries(stats.byYear).sort((a,b)=>String(b[0]).localeCompare(String(a[0])));
    $("yearStats").innerHTML = entries.length ? entries.map(([k,v])=>`<div class="stat-line"><span>${esc(k)}</span><strong>${formatBytes(v)}</strong></div>`).join("") : '<div class="empty">目前沒有附件</div>';
  }
  if($("largestFilesList")){
    $("largestFilesList").innerHTML = stats.sortedLargest.length ? stats.sortedLargest.map(f=>`<div class="big-file-row"><div><strong>${esc(f.name)}</strong><span class="file-size-note">${esc(f.postTitle)}｜${esc(f.url)}</span></div><strong>${formatBytes(f.size||0)}</strong><button class="ghost-btn" data-delete-file="${esc(f.postId)}|${f.index}">刪除</button></div>`).join("") : '<div class="empty">目前沒有附件</div>';
  }

  let repoMb = null;
  try{ repoMb = await fetchRepoSizeMb(); }catch(e){ console.warn(e); }
  const displayMb = repoMb ?? (stats.knownTotal/1024/1024);
  const percent = Math.min(100, Math.round(displayMb / 1000 * 100));
  const status = capacityStatusByMb(displayMb);

  if($("repoSizeText")) $("repoSizeText").textContent = `${displayMb.toFixed(1)} MB / 1000 MB`;
  if($("repoStatusText")) $("repoStatusText").textContent = repoMb === null ? "未讀到 GitHub Repository 實際容量，目前顯示附件估算值。" : "GitHub Repository 實際容量。";
  if($("repoPercentText")) $("repoPercentText").textContent = `${percent}%`;
  if($("repoLightText")) $("repoLightText").textContent = status.light;
  if($("capacityBarFill")) $("capacityBarFill").style.width = percent + "%";
  if($("sidebarCapacityStatus")) $("sidebarCapacityStatus").innerHTML = `v4.3<br>${status.light} ${displayMb.toFixed(0)}MB`;
}
async function deleteGithubFileIfPossible(url){
  if(!url || url.startsWith("http")) return;
  const token = localStorage.getItem("mrp_github_token") || "";
  if(!token) throw new Error("請先設定 GitHub Token，才能刪除附件檔案。");
  const path = url.replace(/^(\.\.\/|\/)/, "");
  const getRes = await fetch(`https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${encodeURIComponent(path).replace(/%2F/g,"/")}?ref=${githubConfig.branch}`, {
    headers:{Authorization:`Bearer ${token}`, Accept:"application/vnd.github+json"}
  });
  if(getRes.status === 404) return;
  const meta = await getRes.json();
  if(!getRes.ok) throw new Error(meta.message || "GitHub 讀取檔案失敗");
  const delRes = await fetch(`https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${encodeURIComponent(path).replace(/%2F/g,"/")}`, {
    method:"DELETE",
    headers:{Authorization:`Bearer ${token}`, Accept:"application/vnd.github+json", "Content-Type":"application/json"},
    body:JSON.stringify({message:`delete attachment: ${path}`, sha:meta.sha, branch:githubConfig.branch})
  });
  const delData = await delRes.json();
  if(!delRes.ok) throw new Error(delData.message || "GitHub 刪除檔案失敗");
}
async function deleteAttachment(postId, fileIndex){
  const post = announcements.find(p=>p.id===postId);
  if(!post) return alert("找不到公告。");
  const files = [...(post.files || [])];
  const file = files[Number(fileIndex)];
  if(!file) return alert("找不到附件。");
  if(!confirm(`確定刪除附件？\n\n${file.name}\n\n公告文字會保留，附件會永久刪除。`)) return;
  try{
    await deleteGithubFileIfPossible(file.url);
    files.splice(Number(fileIndex),1);
    await updateDoc(doc(db,"announcements",postId), {files, updatedAt:serverTimestamp()});
    alert("附件已刪除，公告已保留。");
  }catch(e){
    console.error(e);
    alert("刪除失敗：\n"+e.message);
  }
}
async function deleteAllAttachments(postId){
  const post = announcements.find(p=>p.id===postId);
  if(!post) return alert("找不到公告。");
  const files = [...(post.files || [])];
  if(!files.length) return alert("這篇公告沒有附件。");
  if(!confirm(`確定刪除這篇公告的全部附件？\n\n${post.title}\n\n共 ${files.length} 個附件。\n公告文字會保留。`)) return;
  try{
    for(const file of files){
      await deleteGithubFileIfPossible(file.url);
    }
    await updateDoc(doc(db,"announcements",postId), {files:[], updatedAt:serverTimestamp()});
    alert("這篇公告的附件已全部刪除，公告已保留。");
  }catch(e){
    console.error(e);
    alert("刪除失敗：\n"+e.message);
  }
}

function updateStats(){
  $("statTotal").textContent=announcements.length;
  $("statPublished").textContent=announcements.filter(a=>a.published!==false).length;
  $("statDraft").textContent=announcements.filter(a=>a.published===false).length;
  $("statFiles").textContent=announcements.reduce((sum,a)=>sum+(a.files?.length||0),0);
}
$("postForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(canAssistantDraft()){ $("published").checked=false; $("pinned").checked=false; }
  const title=$("title").value.trim(), content=$("content").value.trim(), date=$("date").value;
  if(!title||!content||!date) return alert("標題、日期、內容必填");
  const urlImages=$("imageUrlInput").value.split("\n").map(x=>x.trim()).filter(Boolean).map(url=>({url,name:url.split("/").pop()}));
  const urlFiles=$("fileUrlInput").value.split("\n").map(x=>x.trim()).filter(Boolean).map(line=>{const [name,url]=line.split("|").map(x=>x.trim()); return {name:name||url,url:url||name};});
  const data={title,content,date,deadline:$("deadline").value||"",category:$("category").value,published:$("published").checked,pinned:$("pinned").checked,images:[...uploadedImages,...urlImages],files:[...uploadedFiles,...urlFiles],authorEmail:currentUser?.email||"",authorName:findStaffByEmail(currentUser?.email)?.name||currentUser?.displayName||currentUser?.email||"",updatedAt:serverTimestamp()};
  try{ const id=$("editId").value; if(id) await updateDoc(doc(db,"announcements",id),data); else{data.createdAt=serverTimestamp(); await addDoc(collection(db,"announcements"),data);} alert("已儲存"); resetForm(); }
  catch(e){ console.error(e); alert("儲存失敗：\n"+e.message); }
});
function renderList(){ const data=announcements.filter(a=>!adminKeyword||(a.title||"").includes(adminKeyword)||(a.content||"").includes(adminKeyword)); $("postList").innerHTML=data.length?data.map(cardHtml).join(""):'<div class="empty">目前沒有內容</div>'; }
function renderRecent(){ $("recentList").innerHTML=announcements.slice(0,5).map(cardHtml).join("")||'<div class="empty">目前沒有內容</div>'; }
function cardHtml(a){
  const deleteButton=canManagePosts()?`<button class="ghost-btn" data-delete="${a.id}">刪除</button>`:"";
  return `<article class="admin-card"><div><div class="admin-card-title">${a.pinned?"📌 ":""}${a.published===false?"【草稿】":"【發布】"}【${esc(a.category)}】${esc(a.title)}</div><div class="admin-card-meta">${esc(a.date)}｜圖片 ${(a.images||[]).length}｜附件 ${(a.files||[]).length}${a.deadline?`｜截止 ${esc(a.deadline)}`:""}${a.authorName?`｜發布者 ${esc(a.authorName)}`:""}</div></div><div class="admin-actions"><button class="ghost-btn" data-line="${a.id}">LINE</button><button class="ghost-btn" data-edit="${a.id}">修改</button>${deleteButton}</div></article>`;
}
function renderLibrary(){
  const groups=announcements.filter(a=>(a.files||[]).length);
  if(!groups.length){ $("libraryList").innerHTML='<div class="empty">目前沒有附件</div>'; return; }
  $("libraryList").innerHTML=groups.map(a=>`<div class="library-group"><h3>${esc(a.title)}</h3><div class="library-meta">分類：${esc(a.category)}｜日期：${esc(a.date)}｜附件 ${(a.files||[]).length} 個</div><div class="library-actions"><button class="ghost-btn" data-delete-all-files="${a.id}">刪除本公告全部附件</button></div>${(a.files||[]).map((f,i)=>`<div class="library-file"><span>📎</span><span>${esc(f.name)}<small>${formatBytes(f.size||0)}｜${esc(f.url)}</small></span><button class="ghost-btn" data-delete-file="${a.id}|${i}">刪除</button></div>`).join("")}</div>`).join("");
}
function normalizeLibraryUrl(url){ if(!url) return "#"; if(url.startsWith("http")||url.startsWith("../")) return url; return "../"+url.replace(/^\//,""); }
function editPost(id){
  const a=announcements.find(x=>x.id===id); if(!a) return;
  showView("posts"); $("editId").value=id; $("formTitle").textContent="修改內容"; $("title").value=a.title||""; $("content").value=a.content||""; $("date").value=a.date||""; $("deadline").value=a.deadline||""; $("category").value=a.category||"公告"; $("published").checked=canAssistantDraft()?false:a.published!==false; $("pinned").checked=canAssistantDraft()?false:!!a.pinned; $("templateSelect").value=""; uploadedImages=a.images||[]; uploadedFiles=a.files||[]; $("imageUrlInput").value=""; $("fileUrlInput").value=""; renderPreviews(); applyRoleUi(); scrollTo({top:0,behavior:"smooth"});
}
function resetForm(){ $("editId").value=""; $("formTitle").textContent="新增內容"; $("templateSelect").value=""; $("title").value=""; $("content").value=""; $("category").value="公告"; $("published").checked=!canAssistantDraft(); $("pinned").checked=false; $("date").valueAsDate=new Date(); $("deadline").value=""; $("imageUrlInput").value=""; $("fileUrlInput").value=""; uploadedImages=[]; uploadedFiles=[]; renderPreviews(); applyRoleUi(); }
function currentFormData(){
  const urlImages=$("imageUrlInput").value.split("\n").map(x=>x.trim()).filter(Boolean).map(url=>({url,name:url.split("/").pop()}));
  const urlFiles=$("fileUrlInput").value.split("\n").map(x=>x.trim()).filter(Boolean).map(line=>{const [name,url]=line.split("|").map(x=>x.trim()); return {name:name||url,url:url||name};});
  return {title:$("title").value.trim()||"",category:$("category").value,date:$("date").value,deadline:$("deadline").value,content:$("content").value.trim(),images:[...uploadedImages,...urlImages],files:[...uploadedFiles,...urlFiles]};
}
function normalizePreviewUrl(url){ if(!url) return ""; if(url.startsWith("http")||url.startsWith("../")) return url; return "../"+url.replace(/^\//,""); }
function showPreviewFromForm(){
  const a=currentFormData(); const imgs=(a.images||[]).map(img=>`<img class="preview-cover" src="${normalizePreviewUrl(img.url)}">`).join(""); const files=(a.files||[]).map(f=>`<div class="field">📎 ${esc(f.name)}</div>`).join("");
  $("previewContent").innerHTML=`<span class="badge">${esc(a.category)}</span><h2>${esc(a.title||"(未輸入標題)")}</h2><p>📅 ${esc(a.date||"未設定")} ${a.deadline?`　⏰ 截止：${esc(a.deadline)}`:""}</p>${imgs}<div class="preview-content">${esc(a.content||"")}</div>${files?`<h3>附件下載</h3>${files}`:""}`;
  $("previewModal").classList.remove("hidden");
}
function makeLineText(a){ const files=(a.files||[]).map(f=>`📎 ${f.name}`).join("\n"); return `📢【${a.title}】\n\n${a.content||""}\n\n📅 發布日期：${a.date||""}${a.deadline?`\n⏰ 截止日期：${a.deadline}`:""}${files?`\n\n${files}`:""}`.trim(); }
async function copyLineText(id){ const a=announcements.find(x=>x.id===id); if(!a) return; await navigator.clipboard.writeText(makeLineText(a)); alert("已複製 LINE 版本文字"); }
async function copyLineTextFromForm(){ const a=currentFormData(); await navigator.clipboard.writeText(makeLineText(a)); alert("已複製 LINE 版本文字"); }
function esc(str){ return String(str).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }
