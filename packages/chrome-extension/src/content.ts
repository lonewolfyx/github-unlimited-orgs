import { enhanceOrganizations } from '@github-unlimited-orgs/core'

// TODO(M4): 生产部署后替换为正式 API 域名，并通过 chrome.storage.sync 支持覆盖
const API_BASE = 'http://localhost:3000'

enhanceOrganizations({ apiBase: API_BASE })
