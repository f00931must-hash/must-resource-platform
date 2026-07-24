# MUST Resource Platform v4.3

資源教室公告管理平台。

## v4.3 新功能
- 新增「容量管理」頁面
- GitHub Repository 容量顯示（需 GitHub Token）
- 容量狀態：🟢正常 / 🟡注意 / 🔴快滿
- 附件容量統計：圖片、PDF、Word、Excel、其他
- 年度容量統計
- 最大附件 Top 10
- 附件中心可刪除單一附件
- 附件中心可刪除某篇公告全部附件
- 公告文字保留，只刪除附件與 GitHub 檔案
- 左下角顯示版本與容量狀態

## 注意
刪除附件會永久刪除 GitHub 上的檔案，公告文字仍會保留。


## v5.0 Portal 權限整合
- 公告平台仍使用自己的 Firebase Google 登入與 Firestore 安全規則。
- 老師名單改由 Portal 的「同步公告權限」寫入本專案 `settings/admins`。
- 公告後台不再提供老師管理介面。
