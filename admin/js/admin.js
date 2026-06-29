import { db, auth } from "../../shared/js/firebase-app.js";
import { allowedAdmins, githubConfig } from "../../shared/js/firebase-config.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const provider = new GoogleAuthProvider();

let announcements = [];
let adminKeyword = "";
let uploadedImages = [];
let uploadedFiles = [];

const templates = {
  activity: {
    category: "活動",
    content: "📢【活動通知】\n\n活動名稱：\n活動日期：\n活動地點：\n參加對象：\n報名方式：\n注意事項：\n聯絡窗口："
  },
  scholarship: {
    category: "獎助學金",
    content: "🎓【獎助學金申請通知】\n\n申請資格：\n申請期限：\n申請方式：\n應備文件：\n注意事項：\n聯絡窗口："
  },
  course: {
    category: "修課通知",
    content: "📚【修課通知】\n\n適用對象：\n重要時程：\n辦理方式：\n注意事項：\n相關連結／附件：\n聯絡窗口："
  },
  general: {
    category: "公告",
    content: "📢【公告】\n\n說明：\n辦理方式：\n注意事項：\n聯絡窗口："
  }
};

$("loginBtn").onclick = async () => {
  try {
    $("loginBtn").disabled = true;
    $("loginBtn").textContent = "登入中...";
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error(e);
    alert("Google 登入失敗：\n" + (e.message || e.code));
  } finally {
    $("loginBtn").disabled = false;
    $("loginBtn").textContent = "使用 Google 登入";
  }
};

$("logoutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, (user) => {
  if (!user) {
    $("loginView").classList.remove("hidden");
    $("appView").classList.add("hidden");
    return;
  }

  if (!allowedAdmins.includes(user.email)) {
    alert("這個帳號沒有後台權限：" + user.email);
    signOut(auth);
    return;
  }

  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("userInfo").textContent = user.email;
  $("githubToken").value = localStorage.getItem("mrp_github_token") || "";
  resetForm();
  listenPosts();
});

let unsubscribe = null;

function listenPosts() {
  if (unsubscribe) return;

  unsubscribe = onSnapshot(query(collection(db, "announcements"), orderBy("date", "desc")), (snapshot) => {
    announcements = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    updateStats();
    renderList();
    renderRecent();
    renderLibrary();
  }, (e) => {
    console.error(e);
    alert("讀取公告失敗：\n" + e.message);
  });
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.onclick = () => showView(btn.dataset.view);
});

function showView(view) {
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $("view-" + view).classList.remove("hidden");

  const titleMap = {
    dashboard: "儀表板",
    posts: "公告管理",
    library: "附件中心",
    settings: "系統設定"
  };
  $("pageTitle").textContent = titleMap[view] || "管理平台";
}

$("saveTokenBtn").onclick = () => {
  localStorage.setItem("mrp_github_token", $("githubToken").value.trim());
  alert("Token 已儲存於此瀏覽器");
};

$("clearTokenBtn").onclick = () => {
  localStorage.removeItem("mrp_github_token");
  $("githubToken").value = "";
  alert("已清除 Token");
};

setupDrop("imageDrop", "imageInput", "image");
setupDrop("fileDrop", "fileInput", "file");

function setupDrop(zoneId, inputId, type) {
  const zone = $(zoneId);
  const input = $(inputId);

  zone.onclick = () => input.click();

  zone.ondragover = (e) => {
    e.preventDefault();
    zone.classList.add("dragover");
  };

  zone.ondragleave = () => zone.classList.remove("dragover");

  zone.ondrop = (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    handleFiles([...e.dataTransfer.files], type);
  };

  input.onchange = () => handleFiles([...input.files], type);
}

async function handleFiles(files, type) {
  const token = localStorage.getItem("mrp_github_token");

  if (!token) {
    alert("請先到「系統設定」貼上 GitHub Token，才能拖曳上傳檔案。");
    return;
  }

  for (const file of files) {
    try {
      const item = await uploadToGithub(file, token, type);
      if (type === "image") uploadedImages.push(item);
      else uploadedFiles.push(item);
    } catch (e) {
      console.error(e);
      alert("上傳失敗：" + file.name + "\n" + e.message);
    }
  }

  renderPreviews();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadToGithub(file, token, type) {
  const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const path = `frontend/assets/uploads/${yyyy}/${mm}/${Date.now()}_${safeName}`;
  const content = await fileToBase64(file);

  const response = await fetch(`https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `upload ${type}: ${file.name}`,
      content,
      branch: githubConfig.branch
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "GitHub API error");

  return {
    name: file.name,
    url: path,
    size: file.size,
    type: file.type
  };
}

function renderPreviews() {
  $("imagePreview").innerHTML = uploadedImages.map((x, i) => `
    <div class="preview-item">
      <img src="../${x.url}">
      <div>${escapeHtml(x.name)}</div>
      <button type="button" class="remove-mini" data-img="${i}">移除</button>
    </div>
  `).join("");

  $("filePreview").innerHTML = uploadedFiles.map((x, i) => `
    <div class="preview-item">
      <strong>📎 ${escapeHtml(x.name)}</strong><br>
      <small>${Math.round((x.size || 0) / 1024)} KB</small>
      <button type="button" class="remove-mini" data-file="${i}">移除</button>
    </div>
  `).join("");

  document.querySelectorAll("[data-img]").forEach((btn) => {
    btn.onclick = () => {
      uploadedImages.splice(Number(btn.dataset.img), 1);
      renderPreviews();
    };
  });

  document.querySelectorAll("[data-file]").forEach((btn) => {
    btn.onclick = () => {
      uploadedFiles.splice(Number(btn.dataset.file), 1);
      renderPreviews();
    };
  });
}

$("resetBtn").onclick = resetForm;

$("adminSearch").oninput = (e) => {
  adminKeyword = e.target.value.trim();
  renderList();
};

$("templateSelect").onchange = (e) => {
  const t = templates[e.target.value];
  if (!t) return;

  if ($("content").value.trim() && !confirm("套用模板會覆蓋目前內容，確定嗎？")) return;

  $("category").value = t.category;
  $("content").value = t.content;
};

$("previewBtn").onclick = () => showPreviewFromForm();
$("lineBtn").onclick = () => copyLineTextFromForm();
$("closePreviewBtn").onclick = () => $("previewModal").classList.add("hidden");

function updateStats() {
  $("statTotal").textContent = announcements.length;
  $("statPublished").textContent = announcements.filter((a) => a.published !== false).length;
  $("statDraft").textContent = announcements.filter((a) => a.published === false).length;
  $("statFiles").textContent = announcements.reduce((sum, a) => sum + (a.files?.length || 0), 0);
}

$("postForm").onsubmit = async (e) => {
  e.preventDefault();

  const title = $("title").value.trim();
  const content = $("content").value.trim();
  const date = $("date").value;

  if (!title || !content || !date) {
    alert("標題、日期、內容必填");
    return;
  }

  const urlImages = $("imageUrlInput").value
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((url) => ({ url, name: url.split("/").pop() }));

  const urlFiles = $("fileUrlInput").value
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, url] = line.split("|").map((x) => x.trim());
      return { name: name || url, url: url || name };
    });

  const data = {
    title,
    content,
    date,
    deadline: $("deadline").value || "",
    category: $("category").value,
    published: $("published").checked,
    pinned: $("pinned").checked,
    images: [...uploadedImages, ...urlImages],
    files: [...uploadedFiles, ...urlFiles],
    updatedAt: serverTimestamp()
  };

  try {
    const id = $("editId").value;

    if (id) await updateDoc(doc(db, "announcements", id), data);
    else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "announcements"), data);
    }

    alert("已儲存");
    resetForm();
  } catch (e) {
    console.error(e);
    alert("儲存失敗：\n" + e.message);
  }
};

function renderList() {
  const data = announcements.filter((a) =>
    !adminKeyword || (a.title || "").includes(adminKeyword) || (a.content || "").includes(adminKeyword)
  );

  $("postList").innerHTML = data.length ? data.map(cardHtml).join("") : '<div class="empty">目前沒有內容</div>';
  bindCardButtons();
}

function renderRecent() {
  $("recentList").innerHTML = announcements.slice(0, 5).map(cardHtml).join("") || '<div class="empty">目前沒有內容</div>';
  bindCardButtons();
}

function cardHtml(a) {
  return `<article class="admin-card">
    <div>
      <div class="admin-card-title">${a.pinned ? "📌 " : ""}${a.published === false ? "【草稿】" : "【發布】"}【${escapeHtml(a.category)}】${escapeHtml(a.title)}</div>
      <div class="admin-card-meta">${escapeHtml(a.date)}｜圖片 ${(a.images || []).length}｜附件 ${(a.files || []).length}${a.deadline ? `｜截止 ${escapeHtml(a.deadline)}` : ""}</div>
    </div>
    <div class="admin-actions">
      <button class="ghost-btn" data-line="${a.id}">LINE</button>
      <button class="ghost-btn" data-edit="${a.id}">修改</button>
      <button class="ghost-btn" data-delete="${a.id}">刪除</button>
    </div>
  </article>`;
}

function bindCardButtons() {
  document.querySelectorAll("[data-line]").forEach((btn) => {
    btn.onclick = () => copyLineText(btn.dataset.line);
  });

  document.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => editPost(btn.dataset.edit);
  });

  document.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.onclick = async () => {
      if (confirm("確定刪除這筆內容？")) {
        await deleteDoc(doc(db, "announcements", btn.dataset.delete));
      }
    };
  });
}

function renderLibrary() {
  const files = announcements.flatMap((a) => (a.files || []).map((f) => ({ ...f, postTitle: a.title, date: a.date })));

  $("libraryList").innerHTML = files.length
    ? files.map((f) => `<a class="field" href="../${f.url}" target="_blank">📎 ${escapeHtml(f.name)}<br><small>來源：${escapeHtml(f.postTitle)}</small></a>`).join("<br>")
    : '<div class="empty">目前沒有附件</div>';
}

function editPost(id) {
  const a = announcements.find((x) => x.id === id);
  if (!a) return;

  showView("posts");
  $("editId").value = id;
  $("formTitle").textContent = "修改內容";
  $("title").value = a.title || "";
  $("content").value = a.content || "";
  $("date").value = a.date || "";
  $("deadline").value = a.deadline || "";
  $("category").value = a.category || "公告";
  $("published").checked = a.published !== false;
  $("pinned").checked = !!a.pinned;
  $("templateSelect").value = "";
  uploadedImages = a.images || [];
  uploadedFiles = a.files || [];
  $("imageUrlInput").value = "";
  $("fileUrlInput").value = "";
  renderPreviews();
  scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  $("editId").value = "";
  $("formTitle").textContent = "新增內容";
  $("templateSelect").value = "";
  $("title").value = "";
  $("content").value = "";
  $("category").value = "公告";
  $("published").checked = true;
  $("pinned").checked = false;
  $("date").valueAsDate = new Date();
  $("deadline").value = "";
  $("imageUrlInput").value = "";
  $("fileUrlInput").value = "";
  uploadedImages = [];
  uploadedFiles = [];
  renderPreviews();
}

function currentFormData() {
  const urlImages = $("imageUrlInput").value
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((url) => ({ url, name: url.split("/").pop() }));

  const urlFiles = $("fileUrlInput").value
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, url] = line.split("|").map((x) => x.trim());
      return { name: name || url, url: url || name };
    });

  return {
    title: $("title").value.trim() || "(未輸入標題)",
    category: $("category").value,
    date: $("date").value,
    deadline: $("deadline").value,
    content: $("content").value.trim(),
    images: [...uploadedImages, ...urlImages],
    files: [...uploadedFiles, ...urlFiles]
  };
}

function normalizePreviewUrl(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("../")) return url;
  return "../" + url.replace(/^\//, "");
}

function showPreviewFromForm() {
  const a = currentFormData();

  const imgs = (a.images || [])
    .map((img) => `<img class="preview-cover" src="${normalizePreviewUrl(img.url)}">`)
    .join("");

  const files = (a.files || [])
    .map((f) => `<div class="field">📎 ${escapeHtml(f.name)}</div>`)
    .join("");

  $("previewContent").innerHTML = `
    <span class="badge">${escapeHtml(a.category)}</span>
    <h2>${escapeHtml(a.title)}</h2>
    <p>📅 ${escapeHtml(a.date || "未設定")} ${a.deadline ? `　⏰ 截止：${escapeHtml(a.deadline)}` : ""}</p>
    ${imgs}
    <div class="preview-content">${escapeHtml(a.content || "")}</div>
    ${files ? `<h3>附件下載</h3>${files}` : ""}
  `;

  $("previewModal").classList.remove("hidden");
}

function makeLineText(a) {
  const files = (a.files || []).map((f) => `📎 ${f.name}`).join("\n");

  return `📢【${a.title}】\n\n${a.content || ""}\n\n📅 發布日期：${a.date || ""}${a.deadline ? `\n⏰ 截止日期：${a.deadline}` : ""}${files ? `\n\n${files}` : ""}`.trim();
}

async function copyLineText(id) {
  const a = announcements.find((x) => x.id === id);
  if (!a) return;

  await navigator.clipboard.writeText(makeLineText(a));
  alert("已複製 LINE 版本文字");
}

async function copyLineTextFromForm() {
  const a = currentFormData();
  await navigator.clipboard.writeText(makeLineText(a));
  alert("已複製 LINE 版本文字");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}
