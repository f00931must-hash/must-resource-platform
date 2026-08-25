import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const params = new URLSearchParams(window.location.search);
const fileUrl = params.get("file") || "";
const fileName = params.get("name") || "PDF 附件";
const viewer = document.getElementById("viewer");
const status = document.getElementById("pageStatus");
document.getElementById("fileName").textContent = fileName;
document.title = `${fileName}｜PDF 預覽`;

document.getElementById("backBtn").onclick = () => {
  if (history.length > 1) history.back();
  else window.location.href = "./";
};

document.getElementById("copyUrlBtn").onclick = async () => {
  if (!fileUrl) return;
  try {
    await navigator.clipboard.writeText(fileUrl);
    alert("檔案網址已複製");
  } catch {
    prompt("請複製以下檔案網址：", fileUrl);
  }
};

function showError(message) {
  viewer.innerHTML = `<section class="error-box"><strong>PDF 無法載入</strong><p>${escapeHtml(message)}</p><button type="button" id="copyFallback" class="viewer-button">複製檔案網址</button></section>`;
  status.textContent = "載入失敗";
  document.getElementById("copyFallback").onclick = () => document.getElementById("copyUrlBtn").click();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
}

async function renderPdf() {
  if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) {
    showError("附件網址不正確。");
    return;
  }
  try {
    const pdf = await pdfjsLib.getDocument({ url: fileUrl }).promise;
    viewer.innerHTML = "";
    status.textContent = `共 ${pdf.numPages} 頁`;
    const maxWidth = Math.min(window.innerWidth - 12, 956);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const cssScale = maxWidth / baseViewport.width;
      const viewport = page.getViewport({ scale: cssScale * pixelRatio });
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-page";
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
      canvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;
      viewer.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      status.textContent = `已載入 ${pageNumber}／${pdf.numPages} 頁`;
    }
    status.textContent = `共 ${pdf.numPages} 頁`;
  } catch (error) {
    console.error(error);
    showError(error?.message || "請稍後再試，或複製網址至瀏覽器開啟。");
  }
}

renderPdf();
