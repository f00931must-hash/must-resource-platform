# MUST Resource Platform v1.0 Beta

明新科技大學資源教室公開資訊管理平台。

## v1.0 Beta 已完成
- 前台公告平台
- 後台管理平台
- Google 登入
- Firestore 公告資料
- 公告新增、修改、刪除
- 發布 / 草稿
- 置頂公告
- 分類篩選
- 搜尋
- 多圖片顯示
- 多附件顯示
- 附件中心雛形
- GitHub Pages 支援
- 根目錄自動導向前台

## 目前架構
- GitHub Pages：放網站與靜態檔案
- Firebase Authentication：後台 Google 登入
- Firestore：公告資料
- Firebase Storage：不使用，避免升級 Blaze

## 重要原則
此平台不放學生個資。

不建議放：
- 學生姓名
- 學號
- 診斷證明
- ISP / ITP
- 個案紀錄
- 輔導紀錄

可放：
- 公開公告
- 活動資訊
- 修課通知
- 獎助學金資訊
- 公開表單
- 公開附件
