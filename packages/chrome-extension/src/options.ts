/**
 * 设置页逻辑：
 * - 查询"在无痕模式下启用"的当前状态（chrome.extension.isAllowedIncognitoAccess）
 * - 引导用户跳转到扩展详情页手动开启（Chrome 的隐私设计：
 *   隐身权限无法由扩展代码或 manifest 直接开启，manifest 中的 "incognito": "spanning"
 *   只声明启用后的行为模式）
 */

const statusEl = document.getElementById('incognito-status')
const detailsBtn = document.getElementById('open-details')

function renderStatus(allowed: boolean | null): void {
  if (!statusEl)
    return
  if (allowed === null) {
    statusEl.textContent = '无法检测（请在无痕窗口外打开本页）'
    statusEl.className = 'status status-unknown'
    return
  }
  statusEl.textContent = allowed ? '已启用' : '未启用'
  statusEl.className = allowed ? 'status status-on' : 'status status-off'
}

// 页面在无痕窗口内打开时该 API 不可用，做降级处理
try {
  if (chrome.extension?.isAllowedIncognitoAccess) {
    chrome.extension.isAllowedIncognitoAccess((allowed: boolean) => {
      renderStatus(typeof allowed === 'boolean' ? allowed : null)
    })
  }
  else {
    renderStatus(null)
  }
}
catch {
  renderStatus(null)
}

detailsBtn?.addEventListener('click', () => {
  const url = `chrome://extensions/?id=${chrome.runtime.id}`
  void chrome.tabs.create({ url })
})
