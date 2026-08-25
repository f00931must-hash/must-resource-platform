import { db } from "../../shared/js/firebase-app.js";
import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let announcements = [];
let currentCategory = "全部";
let activePostId = "";
let pendingPostId = new URLSearchParams(window.location.search).get("post") || "";
const list = document.getElementById("announcementList");

onSnapshot(query(collection(db, "announcements"), orderBy("date", "desc")), (snapshot) => {
  announcements = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  render();
  if (pendingPostId) {
    const id = pendingPostId;
    pendingPostId = "";
    openModal(id, { updateUrl: false });
  }
}, (error) => {
  console.error(error);
  list.innerHTML = '<div class="empty">公告讀取失敗，請確認 Firebase 設定。</div>';
});

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isExpired(item) {
  return item.deadline && item.deadline < todayString();
}

function isNew(item) {
  const d = new Date(item.date);
  if (Number.isNaN(d.getTime())) return false;
  return (new Date() - d) / 86400000 <= 7;
}

function normalizeUrl(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("../")) return url;
  return "../" + url.replace(/^\//, "");
}

function render() {
  const keyword = document.getElementById("searchInput").value.trim();
  const sort = document.getElementById("sortSelect").value;

  let data = announcements
    .filter((a) => a.published !== false)
    .filter((a) => !isExpired(a))
    .filter((a) =>
      (currentCategory === "全部" || a.category === currentCategory) &&
      (!keyword || (a.title || "").includes(keyword) || (a.content || "").includes(keyword))
    );

  data.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return sort === "new"
      ? new Date(b.date) - new Date(a.date)
      : new Date(a.date) - new Date(b.date);
  });

  if (!data.length) {
    list.innerHTML = '<div class="empty">目前沒有符合的公告</div>';
    return;
  }

  list.innerHTML = data.map((a) => {
    const firstImage = normalizeUrl(a.images?.[0]?.url || "");
    return `<article class="post-card ${a.category}">
      <div class="tag-row">
        <span class="badge">${a.pinned ? "📌 置頂・" : ""}${escapeHtml(a.category)}</span>
        ${isNew(a) ? '<span class="new-badge">NEW</span>' : ""}
      </div>
      ${firstImage ? `<img class="thumb" src="${firstImage}" alt="">` : ""}
      <h3>${escapeHtml(a.title)}</h3>
      <div class="preview">${escapeHtml(a.content || "")}</div>
      <div class="meta">
        <span>📅 ${escapeHtml(a.date)}</span>
        <span class="open-btn" data-id="${a.id}">查看全文 →</span>
      </div>
    </article>`;
  }).join("");

  document.querySelectorAll(".open-btn").forEach((btn) => {
    btn.onclick = () => openModal(btn.dataset.id);
  });
}

function postUrl(id) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("post", id);
  return url.toString();
}

async function copyPostLink(id) {
  const url = postUrl(id);
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const input = document.createElement("textarea");
    input.value = url;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  const button = document.getElementById("copyPostLinkBtn");
  if (button) {
    const oldText = button.textContent;
    button.textContent = "✅ 已複製連結";
    setTimeout(() => { button.textContent = oldText; }, 1800);
  }
}

function openModal(id, { updateUrl = true } = {}) {
  const a = announcements.find((x) => x.id === id);
  if (!a || a.published === false || isExpired(a)) {
    if (id) alert("這篇公告不存在、尚未發布或已截止。");
    return;
  }
  activePostId = id;

  const imgs = (a.images || [])
    .map((img) => `<img class="modal-img" src="${normalizeUrl(img.url)}" alt="">`)
    .join("");

  const files = (a.files || [])
    .map((f) => `<a class="file" href="${normalizeUrl(f.url)}" target="_blank" rel="noopener">📎 ${escapeHtml(f.name)}</a>`)
    .join("");

  document.getElementById("modalContent").innerHTML = `
    <span class="badge">${escapeHtml(a.category)}</span>
    ${isNew(a) ? '<span class="new-badge">NEW</span>' : ""}
    <h2>${escapeHtml(a.title)}</h2>
    <p>📅 ${escapeHtml(a.date)} ${a.deadline ? `　⏰ 截止：${escapeHtml(a.deadline)}` : ""}</p>
    <div class="share-box">
      <div><strong>分享這篇公告</strong><span>複製連結貼給學生，開啟後會直接看到本篇公告。</span></div>
      <button type="button" id="copyPostLinkBtn" class="share-btn">🔗 複製公告連結</button>
    </div>
    ${imgs}
    <div class="content">${escapeHtml(a.content || "")}</div>
    ${files ? `<h3>附件下載</h3>${files}` : ""}
  `;

  document.getElementById("modal").style.display = "block";
  document.body.classList.add("modal-open");
  document.getElementById("copyPostLinkBtn").onclick = () => copyPostLink(id);
  if (updateUrl) history.pushState({ post: id }, "", postUrl(id));
}

window.closeModal = () => {
  document.getElementById("modal").style.display = "none";
  document.body.classList.remove("modal-open");
  activePostId = "";
  const url = new URL(window.location.href);
  if (url.searchParams.has("post")) {
    url.searchParams.delete("post");
    history.replaceState({}, "", url.pathname + url.search + url.hash);
  }
};

window.closeByBg = (e) => {
  if (e.target.id === "modal") closeModal();
};

document.querySelectorAll(".module").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".module").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentCategory = btn.dataset.category;
    render();
  };
});

document.getElementById("searchInput").oninput = render;
document.getElementById("sortSelect").onchange = render;

window.addEventListener("popstate", () => {
  const id = new URLSearchParams(window.location.search).get("post");
  if (id) openModal(id, { updateUrl: false });
  else if (activePostId) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activePostId) closeModal();
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}
