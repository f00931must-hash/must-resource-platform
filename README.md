# MUST Resource Platform v4.2

## 新功能
- 多位老師共同管理
- 後台可新增 / 移除 / 修改管理員
- 權限分級：
  - 👑 超級管理員：可管理老師、系統與公告
  - 👨‍🏫 老師：可發布、修改、刪除公告
  - 📝 助理：可建立與修改草稿，不能發布與刪除
- Firestore Rules 安全版

## 重要
上傳 v4.2 後，請到 Firebase → Firestore Database → Rules，把 `firebase/firestore.rules` 內容貼上並發布。
