## 影像拼貼與輸出 (GIF / MP4)

功能：
- 上傳多張圖片（含動態 GIF）
- 物件可拖曳、縮放、旋轉、前後層次調整
- 錄製畫布輸出 WebM，並以 ffmpeg.wasm 轉 MP4 或 GIF

本地開啟：
1. 雙擊 `index.html` 以瀏覽器開啟（建議 Chrome）

部署到 GitHub Pages：
1. 建立新 GitHub repository（例如 `image-composer`）
2. 推送此資料夾內容
3. 在 GitHub → Settings → Pages：
   - Source: `Deploy from a branch`
   - Branch: `main` / 根目錄 `/` → Save
4. 稍待數分鐘後，於 Pages 網址存取

注意：
- 首次轉檔會下載 ffmpeg.wasm（~20-30MB），請耐心等候
- 部分瀏覽器需透過 HTTPS 啟用 `MediaRecorder`


