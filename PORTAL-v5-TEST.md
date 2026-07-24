# 公告平台 v5.0 Portal 權限測試

## 測試前
1. Portal 的 `systems` 文件 ID 必須是 `announcement`。
2. 老師文件位於 `portalUsers/{email}`。
3. 老師需為 `enabled: true`。
4. 權限需包含 `permissions.announcement: true`；最高管理者 `role: admin` 不受此限制。
5. Firebase Authentication 的 Authorized domains 需包含 GitHub Pages 網域。

## 測試方式
- 有公告權限的帳號：應可登入並看到原後台。
- 沒有公告權限的帳號：應顯示「沒有公告系統的後台權限」。
- 已停用帳號：應顯示帳號已停用。
- 直接輸入 `/admin/` 網址：仍會再次執行 Portal 權限驗證。

## 目前架構提醒
本版完成瀏覽器端 Portal 權限閘門。公告 Firebase 的 Firestore Rules 仍維持原本名單規則，以免直接放寬資料庫寫入權限。正式完全中央化前，新的 Portal 老師若要寫入公告資料，仍需完成後端權限同步方案。
