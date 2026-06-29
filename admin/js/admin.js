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
  activity: { category: "活動", content: "📢【活動通知】\n\n活動名稱：\n活動日期：\n活動地點：\n參加對象：\n報名方式：\n注意事項：\n聯絡窗口：" },
  scholarship: { category: "獎助學金", content: "🎓【獎助學金申請通知】\n\n申請資格：\n申請期限：\n申請方式：\n應備文件：\n注意事項：\n聯絡窗口：" },
  course: { category: "修課通知", content: "📚【修課通知】\n\n適用對象：\n重要時程：\n辦理方式：\n注意事項：\n相關連結／附件：\n聯絡窗口：" },
  general: { category: "公告", content: "📢【公告】\n\n說明：\n辦理方式：\n注意事項：\n聯絡窗口：" }
};

const aiPrompts = {
  formal: "請將以下公告內容改寫成正式、清楚、適合大學資源教室發布的公告。保留重要日期、地點、資格、附件資訊。請使用繁體中文。",
  student: "請將以下公告內容改寫成學生容易理解的白話版，語氣親切清楚，重要事項用條列呈現。請使用繁體中文。",
  line: "請將以下公告內容改寫成適合 LINE 官方帳號發布的版本，精簡、有 emoji、重點清楚。請使用繁體中文。",
  short: "請將以下公告內容濃縮成 500 字以內，保留最重要的日期、對象、方式、附件或連結。請使用繁體中文。",
  emoji: "請將以下公告內容整理得更容易閱讀，加入適量 emoji，但不要太花俏。請使用繁體中文。"
};

function bindIfExists(id, eventName, handler) {
  const el = $(id);
  if (el) el[eventName] = handler;
}

bindIfExists("loginBtn", "onclick", async () => {
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
});

bindIfExists("logoutBtn", "onclick", () => signOut(auth));

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

  if ($("githubToken")) $("githubToken").value = localStorage.getItem("mrp_github_token") || "";
  if ($("openaiKey")) $("openaiKey").value = localStorage.getItem("mrp_openai_key") || "";
  if ($("openaiModel")) $("openaiModel").value = localStorage.getItem("mrp_openai_model") || "gpt-5.5";

  resetForm();
  listenPosts();
});

let unsubscribe = null;
function listenPosts() {
  if (unsubscribe) return;
  unsubscribe = onSnapshot(query(collection(db, "announcements"), orderBy("date", "desc")), (snapshot) => {
    announcements = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  $("pageTitle").textContent = {dashboard:"儀表板", posts:"公告管理", library:"附件中心", settings:"系統設定"}[view] || "管理平台";
}

bindIfExists("saveTokenBtn", "onclick", () => {
  localStorage.setItem("mrp_github_token", $("githubToken").value.trim());
  alert("Token 已儲存於此瀏覽器");
});
bindIfExists("clearTokenBtn", "onclick", () => {
  localStorage.removeItem("mrp_github_token");
  $("githubToken").value = "";
  alert("已清除 Token");
});
bindIfExists("saveOpenAiBtn", "onclick", () => {
  localStorage.setItem("mrp_openai_key", $("openaiKey").value.trim());
  localStorage.setItem("mrp_openai_model", $("openaiModel").value.trim() || "gpt-5.5");
  alert("AI 設定已儲存於此瀏覽器");
});
bindIfExists("clearOpenAiBtn", "onclick", () => {
  localStorage.removeItem("mrp_openai_key");
  localStorage.removeItem("mrp_openai_model");
  $("openaiKey").value = "";
  $("openaiModel").value = "gpt-5.5";
  alert("已清除 AI 設定");
});

setupDrop("imageDrop", "imageInput", "image");
setupDrop("fileDrop", "fileInput", "file");

function setupDrop(zoneId, inputId, type) {
  const zone = $(zoneId);
  const input = $(inputId);
  if (!zone || !input) return;

  zone.onclick = () => input.click();
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add("dragover"); };
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
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function uploadToGithub(file, token, type) {
  const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const path = `frontend/assets/uploads/${yyyy}/${mm}/${Date.now()}_${safeName}`;
  const content = await fileToBase64(file);

  const res = await fetch(`https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message: `upload ${type}: ${file.name}`, content, branch: githubConfig.branch })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "GitHub API error");
  return { name:file.name, url:path, size:file.size, type:file.type };
}

function renderPreviews() {
  if ($("imagePreview")) {
    $("imagePreview").innerHTML = uploadedImages.map((x, i) => `
      <div class="preview-item">
        <img src="../${x.url}">
        <div>${escapeHtml(x.name)}</div>
        <button type="button" class="remove-mini" data-img="${i}">移除</button>
      </div>`).join("");
  }

  if ($("filePreview")) {
    $("filePreview").innerHTML = uploadedFiles.map((x, i) => `
      <div class="preview-item">
        <strong>📎 ${escapeHtml(x.name)}</strong><br>
        <small>${Math.round((x.size || 0) / 1024)} KB</small>
        <button type="button" class="remove-mini" data-file="${i}">移除</button>
      </div>`).join("");
  }

  document.querySelectorAll("[data-img]").forEach((btn) => {
    btn.onclick = () => { uploadedImages.splice(Number(btn.dataset.img), 1); renderPreviews(); };
  });
  document.querySelectorAll("[data-file]").forEach((btn) => {
    btn.onclick = () => { uploadedFiles.splice(Number(btn.dataset.file), 1); renderPreviews(); };
  });
}

bindIfExists("resetBtn", "onclick", resetForm);
bindIfExists("adminSearch", "oninput", (e) => {
  adminKeyword = e.target.value.trim();
  renderList();
});
bindIfExists("templateSelect", "onchange", (e) => {
  const t = templates[e.target.value];
  if (!t) return;
  if ($("content").value.trim() && !confirm("套用模板會覆蓋目前內容，確定嗎？")) return;
  $("category").value = t.category;
  $("content").value = t.content;
});

bindIfExists("previewBtn", "onclick", showPreviewFromForm);
bindIfExists("lineBtn", "onclick", copyLineTextFromForm);
bindIfExists("closePreviewBtn", "onclick", () => $("previewModal").classList.add("hidden"));
bindIfExists("closeAiBtn", "onclick", () => $("aiModal").classList.add("hidden"));
bindIfExists("applyAiBtn", "onclick", () => {
  if ($("aiResult").value.trim()) $("content").value = $("aiResult").value.trim();
  $("aiModal").classList.add("hidden");
});
bindIfExists("copyAiBtn", "onclick", async () => {
  await navigator.clipboard.writeText($("aiResult").value);
  alert("已複製");
});

document.querySelectorAll(".ai-action").forEach((btn) => {
  btn.onclick = () => runAi(btn.dataset.ai);
});

async function runAi(mode) {
  const data = currentFormData();
  const instruction = aiPrompts[mode] || aiPrompts.formal;
  const source = `標題：${data.title}\n分類：${data.category}\n發布日期：${data.date}\n截止日期：${data.deadline || "無"}\n\n內容：\n${data.content}`;
  const prompt = `${instruction}\n\n${source}`;

  if (!data.content.trim() && !data.title.trim()) {
    alert("請先輸入標題或公告內容，再使用 AI。");
    return;
  }

  const apiKey = localStorage.getItem("mrp_openai_key") || "";
  const model = localStorage.getItem("mrp_openai_model") || "gpt-5.5";

  if (!apiKey) {
    $("aiResult").value = `請幫我處理以下資源教室公告。\n\n需求：${instruction}\n\n公告內容：\n${source}`;
    $("aiModal").classList.remove("hidden");
    try { await navigator.clipboard.writeText($("aiResult").value); } catch {}
    alert("尚未設定 OpenAI API Key，已改為複製 ChatGPT 提示詞。");
    return;
  }

  try {
    $("aiResult").value = "AI 產生中，請稍候...";
    $("aiModal").classList.remove("hidden");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: prompt })
    });

    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || "OpenAI API error");
    $("aiResult").value = json.output_text || extractResponseText(json) || "AI 沒有回傳文字。";
  } catch (e) {
    console.error(e);
    $("aiResult").value = `AI 呼叫失敗：${e.message}\n\n已改為提示詞模式，請複製以下內容到 ChatGPT：\n\n${prompt}`;
  }
}

function extractResponseText(json) {
  try {
    return json.output?.flatMap((item) => item.content || [])?.map((c) => c.text || "")?.join("\n")?.trim();
  } catch { return ""; }
}

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

  const urlImages = $("imageUrlInput").value.split("\n").map((x) => x.trim()).filter(Boolean).map((url) => ({ url, name: url.split("/").pop() }));
  const urlFiles = $("fileUrlInput").value.split("\n").map((x) => x.trim()).filter(Boolean).map((line) => {
    const [name, url] = line.split("|").map((x) => x.trim());
    return { name:name || url, url:url || name };
  });

  const data = {
    title, content, date,
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
  const data = announcements.filter((a) => !adminKeyword || (a.title || "").includes(adminKeyword) || (a.content || "").includes(adminKeyword));
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
  document.querySelectorAll("[data-line]").forEach((btn) => { btn.onclick = () => copyLineText(btn.dataset.line); });
  document.querySelectorAll("[data-edit]").forEach((btn) => { btn.onclick = () => editPost(btn.dataset.edit); });
  document.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.onclick = async () => {
      if (confirm("確定刪除這筆內容？")) await deleteDoc(doc(db, "announcements", btn.dataset.delete));
    };
  });
}

function renderLibrary() {
  const groups = announcements.filter((a) => (a.files || []).length);
  if (!groups.length) {
    $("libraryList").innerHTML = '<div class="empty">目前沒有附件</div>';
    return;
  }

  $("libraryList").innerHTML = groups.map((a) => `
    <div class="library-group">
      <h3>${escapeHtml(a.title)}</h3>
      <div class="library-meta">分類：${escapeHtml(a.category)}｜日期：${escapeHtml(a.date)}</div>
      ${(a.files || []).map((f) => `
        <a class="library-file" href="${normalizeLibraryUrl(f.url)}" target="_blank" rel="noopener">
          <span>📎</span>
          <span>${escapeHtml(f.name)}<small>${escapeHtml(f.url)}</small></span>
        </a>
      `).join("")}
    </div>
  `).join("");
}

function normalizeLibraryUrl(url) {
  if (!url) return "#";
  if (url.startsWith("http") || url.startsWith("../")) return url;
  return "../" + url.replace(/^\//, "");
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
  if ($("templateSelect")) $("templateSelect").value = "";
  uploadedImages = a.images || [];
  uploadedFiles = a.files || [];
  $("imageUrlInput").value = "";
  $("fileUrlInput").value = "";
  renderPreviews();
  scrollTo({ top:0, behavior:"smooth" });
}

function resetForm() {
  if (!$("editId")) return;
  $("editId").value = "";
  $("formTitle").textContent = "新增內容";
  if ($("templateSelect")) $("templateSelect").value = "";
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
  const urlImages = $("imageUrlInput").value.split("\n").map((x) => x.trim()).filter(Boolean).map((url) => ({ url, name:url.split("/").pop() }));
  const urlFiles = $("fileUrlInput").value.split("\n").map((x) => x.trim()).filter(Boolean).map((line) => {
    const [name, url] = line.split("|").map((x) => x.trim());
    return { name:name || url, url:url || name };
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
  const imgs = (a.images || []).map((img) => `<img class="preview-cover" src="${normalizePreviewUrl(img.url)}">`).join("");
  const files = (a.files || []).map((f) => `<div class="field">📎 ${escapeHtml(f.name)}</div>`).join("");

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
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[m]));
}
