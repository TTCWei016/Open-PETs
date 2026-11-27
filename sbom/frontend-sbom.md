# Open-PETs 前端軟體物料清單（SBOM）摘要

- 產生時間：2026-11-27T07:18:10Z
- 格式：CycloneDX 1.5（JSON），完整清單見 `frontend-sbom.cdx.json`
- 主元件：open-pets-frontend 2.0.0（MIT）
- 範圍：正式執行相依（package.json 的 dependencies 及其傳遞相依）；建置與測試工具（devDependencies）不隨產品交付，不列入
- 元件總數：122（直接相依 20、間接相依 102）
- 後端（Python）與映像檔 SBOM 見同資料夾的 `image-sbom.cdx.json`（CycloneDX，Trivy 對映像檔產製）與 `THIRD_PARTY_NOTICES.txt`（映像檔內 Python 套件授權全文）
- 每個元件的授權全文已直接放在 SBOM 內（`licenses[].license.text`）；另提供 `FRONTEND_THIRD_PARTY_LICENSES.md`（授權清單）、`3.2_附件一_開源元件授權全文_前端.txt`（授權全文純文字版，版面比照廠商附件一），授權清單格式比照後端的 THIRD_PARTY_LICENSES.md
- 重新產生：`npm install` 後執行 `npm run sbom`

## 直接相依

| 套件 | 版本 | 授權 |
|---|---|---|
| @ant-design/icons | 6.3.4 | MIT |
| antd | 6.7.0 | MIT |
| axios | 1.21.1 | MIT |
| crypto-js | 4.2.0 | MIT |
| echarts | 6.1.0 | Apache-2.0 |
| echarts-for-react | 3.0.6 | MIT |
| i18next | 26.7.2 | MIT |
| lucide-react | 1.73.0 | ISC |
| papaparse | 5.7.1 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| react-i18next | 17.1.13 | MIT |
| react-router-dom | 7.18.5 | MIT |
| swagger-ui-dist | 5.35.0 | Apache-2.0 |
| tslib | 2.3.0 | 0BSD |
| tslib | 2.8.1 | 0BSD |
| tslib | 2.3.0 | 0BSD |
| xlsx | 0.20.3 | Apache-2.0 |
| yaml | 2.9.1 | ISC |
| zustand | 5.1.0 | MIT |

## 授權統計（全部元件）

| 授權 | 元件數 |
|---|---|
| MIT | 111 |
| Apache-2.0 | 4 |
| ISC | 3 |
| 0BSD | 3 |
| BSD-3-Clause | 1 |
