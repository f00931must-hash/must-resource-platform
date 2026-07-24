# GitHub Token 設定

## 用途
v3.0 要做到「拖曳圖片或附件後自動放到 GitHub」，所以需要 GitHub Token。

## 建議設定
到 GitHub：
Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token

設定：
- Repository access：Only select repositories
- 選擇：must-resource-platform
- Permissions：
  - Contents：Read and write

產生後複製 Token。

## 在後台設定
登入後台 → 系統設定 → 貼上 GitHub Token → 儲存

Token 只會存在你目前瀏覽器的 localStorage，不會存在 Firestore。
如果換電腦或清除瀏覽器資料，需要重新貼一次。
