import { db, auth } from "../../shared/js/firebase-app.js";
import { allowedAdmins } from "../../shared/js/firebase-config.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = id => document.getElementById(id);
const provider = new GoogleAuthProvider();
let announcements = [];
let adminKeyword = "";

$("loginBtn").onclick = async () => {
  try {
    $("loginBtn").disabled = true;
    $("loginBtn").textContent = "登入中...";
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error(err);
    alert(
      "Google 登入失敗。\n\n" +
      "常見原因：\n" +
      "1. Firebase Authentication 尚未啟用 Google 登入。\n" +
      "2. Authorized domains 尚未加入 f00931must-hash.github.io。\n" +
      "3. 瀏覽器封鎖彈出視窗。\n\n" +
      "錯誤訊息：" + (err.message || err.code)
    );
  } finally {
    $("loginBtn").disabled = false;
    $("loginBtn").textContent = "使用 Google 登入";
  }
};

$("logoutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, user=>{
  if(!user){
    $("loginView").classList.remove("hidden");
    $("appView").classList.add("hidden");
    return;
  }
  if(!allowedAdmins.includes(user.email)){
    alert("這個帳號沒有後台權限：" + user.email + "\n\n請確認 shared/js/firebase-config.js 的 allowedAdmins 是否有加入此 Email。");
    signOut(auth);
    return;
  }
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("userInfo").textContent = user.email;
  resetForm();
  listenPosts();
});

let unsubscribe = null;
function listenPosts(){
  if(unsubscribe) return;
  unsubscribe = onSnapshot(query(collection(db, "announcements"), orderBy("date","desc")), snapshot=>{
    announcements = snapshot.docs.map(doc=>({id:doc.id, ...doc.data()}));
    updateStats(); renderList(); renderRecent(); renderLibrary();
  }, err=>{
    console.error(err);
    alert("讀取公告失敗，請檢查 Firestore 規則。\n\n" + err.message);
  });
}

document.querySelectorAll(".nav-item").forEach(btn=>btn.onclick=()=>showView(btn.dataset.view));
function showView(view){
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  $("view-"+view).classList.remove("hidden");
  const titleMap = {dashboard:"儀表板",posts:"公告管理",library:"附件中心",settings:"系統設定"};
  $("pageTitle").textContent = titleMap[view] || "管理平台";
}

$("resetBtn").onclick = resetForm;
$("adminSearch").oninput = e => { adminKeyword = e.target.value.trim(); renderList(); };

function updateStats(){
  $("statTotal").textContent = announcements.length;
  $("statPublished").textContent = announcements.filter(a=>a.published!==false).length;
  $("statDraft").textContent = announcements.filter(a=>a.published===false).length;
  $("statFiles").textContent = announcements.reduce((sum,a)=>sum+(a.files?.length||0),0);
}

$("postForm").onsubmit = async e=>{
  e.preventDefault();
  const title = $("title").value.trim();
  const content = $("content").value.trim();
  const date = $("date").value;
  if(!title || !content || !date){ alert("標題、日期、內容必填"); return; }

  const images = $("images").value.split("\n").map(x=>x.trim()).filter(Boolean).map(url=>({url,name:url.split("/").pop()}));
  const files = $("files").value.split("\n").map(x=>x.trim()).filter(Boolean).map(line=>{
    const [name,url] = line.split("|").map(x=>x.trim());
    return {name:name || url, url:url || name};
  });

  const data = {title, content, date, category:$("category").value, published:$("published").checked, pinned:$("pinned").checked, images, files, updatedAt:serverTimestamp()};
  const editId = $("editId").value;

  try {
    if(editId) await updateDoc(doc(db,"announcements",editId), data);
    else { data.createdAt = serverTimestamp(); await addDoc(collection(db,"announcements"), data); }
    alert("已儲存");
    resetForm();
  } catch (err) {
    console.error(err);
    alert("儲存失敗，請檢查 Firestore 規則或登入權限。\n\n" + err.message);
  }
};

function renderList(){
  let data = announcements.filter(a=>!adminKeyword || (a.title||"").includes(adminKeyword) || (a.content||"").includes(adminKeyword));
  $("postList").innerHTML = data.length ? data.map(a=>cardHtml(a)).join("") : `<div class="empty">目前沒有內容</div>`;
  bindCardButtons();
}
function renderRecent(){
  $("recentList").innerHTML = announcements.slice(0,5).map(a=>cardHtml(a)).join("") || `<div class="empty">目前沒有內容</div>`;
  bindCardButtons();
}
function cardHtml(a){
  return `<article class="admin-card"><div><div class="admin-card-title">${a.pinned?"📌 ":""}${a.published===false?"【草稿】":"【發布】"}【${escapeHtml(a.category)}】${escapeHtml(a.title)}</div><div class="admin-card-meta">${escapeHtml(a.date)}｜圖片 ${(a.images||[]).length}｜附件 ${(a.files||[]).length}</div></div><div class="admin-actions"><button class="ghost-btn" data-edit="${a.id}">修改</button><button class="ghost-btn" data-delete="${a.id}">刪除</button></div></article>`;
}
function bindCardButtons(){
  document.querySelectorAll("[data-edit]").forEach(btn=>btn.onclick=()=>editPost(btn.dataset.edit));
  document.querySelectorAll("[data-delete]").forEach(btn=>btn.onclick=async()=>{
    if(confirm("確定刪除這筆內容？")) {
      try { await deleteDoc(doc(db,"announcements",btn.dataset.delete)); }
      catch(err){ alert("刪除失敗：\n" + err.message); }
    }
  });
}
function renderLibrary(){
  const files = announcements.flatMap(a=>(a.files||[]).map(f=>({...f, postTitle:a.title, date:a.date})));
  $("libraryList").innerHTML = files.length ? files.map(f=>`<a class="library-item" href="${f.url}" target="_blank" rel="noopener"><strong>📎 ${escapeHtml(f.name)}</strong><div class="small">來源：${escapeHtml(f.postTitle)}｜${escapeHtml(f.date)}</div></a>`).join("") : `<div class="empty">目前沒有附件</div>`;
}
function editPost(id){
  const a = announcements.find(x=>x.id===id);
  if(!a) return;
  showView("posts");
  $("editId").value = id;
  $("formTitle").textContent = "修改內容";
  $("title").value = a.title || "";
  $("content").value = a.content || "";
  $("date").value = a.date || "";
  $("category").value = a.category || "公告";
  $("published").checked = a.published !== false;
  $("pinned").checked = !!a.pinned;
  $("images").value = (a.images||[]).map(x=>x.url).join("\n");
  $("files").value = (a.files||[]).map(x=>`${x.name}|${x.url}`).join("\n");
  scrollTo({top:0, behavior:"smooth"});
}
function resetForm(){
  $("editId").value = "";
  $("formTitle").textContent = "新增內容";
  $("title").value = "";
  $("content").value = "";
  $("category").value = "公告";
  $("published").checked = true;
  $("pinned").checked = false;
  $("date").valueAsDate = new Date();
  $("images").value = "";
  $("files").value = "";
}
function escapeHtml(str){return String(str).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
