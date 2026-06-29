# MUST Resource Platform v4.1

資源教室公告管理平台。

## v4.1 新功能
- 多位老師管理員
- 後台「系統設定」可新增 / 移除老師 Email
- 管理員名單存放於 Firestore：`settings/admins`
- Firestore Rules 改為讀取管理員名單判斷權限
- 保留 v4.0 AI 公告助手、圖片/附件拖曳、LINE 版本、公告模板

## 重要
更新 v4.1 後，請同步更新 Firebase Firestore Rules，使用 `firebase/firestore.rules` 裡面的規則。

## 第一位最高管理員
預設最高管理員：
master004400@gmail.com

這個帳號永遠保留管理權限，用來新增其他老師。
