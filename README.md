# MUST Resource Platform v5.2

資源教室公告管理平台。

## v5.2 公告分享與 AI 改版
- 每篇公告支援 `?post=公告ID` 專屬網址，開啟後直接顯示指定公告。
- 公告彈窗新增「複製公告連結」，方便貼給學生。
- 專屬網址相容既有公告，不搬移、不修改 Firestore 公告資料。
- AI 公告助手新增智慧整理、學生白話、LINE 貼文、500 字內與只校對模式。
- AI 提示規則會保留日期、數字、聯絡資訊、附件與原始列點，並禁止自行捏造缺漏資訊。
- AI 公告助手改由共用 Worker v1.3.11 的 `/ai/announcement` 處理，不再於瀏覽器保存 OpenAI API Key。

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
