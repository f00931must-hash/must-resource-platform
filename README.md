# MUST Resource Platform v3.0

資源教室公告管理平台。

## v3.0 新增
- 後台可拖曳圖片
- 後台可拖曳 PDF / Word / Excel / PPT / ZIP
- 可直接貼圖片或附件網址
- 可設定 GitHub Token
- 檔案會上傳到 GitHub Repository 的 `frontend/assets/uploads/`
- 公告資料仍存 Firestore
- 不使用 Firebase Storage，不需要升級 Blaze

## 重要提醒
GitHub Token 是免費的，但它等於鑰匙。請只建立 Fine-grained token，並只給這個 repo 的 Contents Read and write 權限。
