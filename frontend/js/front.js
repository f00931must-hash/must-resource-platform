import { db } from "../../shared/js/firebase-app.js";
import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let announcements = [];
let currentCategory = "全部";
const list = document.getElementById("announcementList");

onSnapshot(query(collection(db, "announcements"), orderBy("date", "desc")), (snapshot)=>{
  announcements = snapshot.docs.map(doc=>({id:doc.id, ...doc.data()}));
  render();
}, ()=>{
  list.innerHTML = `<div class="empty">公告讀取失敗，請確認 Firebase 設定。</div>`;
});

function render(){
  const keyword = document.getElementById("searchInput").value.trim();
  const sort = document.getElementById("sortSelect").value;
  let data = announcements
    .filter(a=>a.published !== false)
    .filter(a=>(currentCategory==="全部" || a.category===currentCategory) && (!keyword || (a.title||"").includes(keyword) || (a.content||"").includes(keyword)));

  data.sort((a,b)=>{
    if(a.pinned && !b.pinned) return -1;
    if(!a.pinned && b.pinned) return 1;
    return sort==="new" ? new Date(b.date)-new Date(a.date) : new Date(a.date)-new Date(b.date);
  });

  if(!data.length){ list.innerHTML = `<div class="empty">目前沒有符合的公告</div>`; return; }

  list.innerHTML = data.map(a=>{
    const firstImage = a.images?.[0]?.url || "";
    return `<article class="post-card ${a.category}">
      <span class="badge">${a.pinned ? "📌 置頂・" : ""}${escapeHtml(a.category)}</span>
      ${firstImage ? `<img class="thumb" src="${firstImage}" alt="">` : ""}
      <h3>${escapeHtml(a.title)}</h3>
      <div class="preview">${escapeHtml(a.content || "")}</div>
      <div class="meta"><span>📅 ${escapeHtml(a.date)}</span><span class="open-btn" data-id="${a.id}">查看全文 →</span></div>
    </article>`;
  }).join("");

  document.querySelectorAll(".open-btn").forEach(btn=>btn.onclick=()=>openModal(btn.dataset.id));
}

function openModal(id){
  const a = announcements.find(x=>x.id===id);
  if(!a) return;
  const imgs = (a.images||[]).map(img=>`<img class="modal-img" src="${img.url}" alt="">`).join("");
  const files = (a.files||[]).map(f=>`<a class="file" href="${f.url}" target="_blank" rel="noopener">📎 ${escapeHtml(f.name)}</a>`).join("");
  document.getElementById("modalContent").innerHTML = `<span class="badge">${escapeHtml(a.category)}</span><h2>${escapeHtml(a.title)}</h2><p>📅 ${escapeHtml(a.date)}</p>${imgs}<div class="content">${escapeHtml(a.content||"")}</div>${files ? `<h3>附件下載</h3>${files}` : ""}`;
  document.getElementById("modal").style.display = "block";
}
window.closeModal=()=>document.getElementById("modal").style.display="none";
window.closeByBg=(e)=>{if(e.target.id==="modal") closeModal();};

document.querySelectorAll(".module").forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll(".module").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    currentCategory = btn.dataset.category;
    render();
  };
});
document.getElementById("searchInput").oninput = render;
document.getElementById("sortSelect").onchange = render;
function escapeHtml(str){return String(str).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
