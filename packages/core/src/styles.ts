/**
 * 悬停卡片样式，全部注入到 Shadow Root 内与 GitHub 页面样式隔离。
 * 颜色优先取 GitHub CSS 变量（自动适配亮暗主题），变量缺失时回退到亮色值。
 */
export const cardStyles = `
:host {
  all: initial;
}
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
.guo-card {
  pointer-events: auto;
  display: flex;
  gap: 12px;
  width: max-content;
  max-width: 320px;
  padding: 12px;
  background: var(--bgColor-default, var(--color-canvas-default, #ffffff));
  color: var(--fgColor-default, var(--color-fg-default, #1f2328));
  border: 1px solid var(--borderColor-default, var(--color-border-default, #d1d9e0));
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(31, 35, 40, 0.12);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
}
.guo-card__avatar {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  flex: none;
}
.guo-card__body {
  min-width: 0;
}
.guo-card__label {
  font-size: 14px;
  font-weight: 600;
}
.guo-card__username {
  color: var(--fgColor-muted, var(--color-fg-muted, #59636e));
}
.guo-card__desc {
  margin-top: 4px;
}
.guo-card__join {
  margin-top: 4px;
  color: var(--fgColor-muted, var(--color-fg-muted, #59636e));
}
.guo-card__link {
  display: inline-block;
  margin-top: 6px;
  color: var(--fgColor-accent, var(--color-accent-fg, #0969da));
  text-decoration: none;
}
.guo-card__link:hover {
  text-decoration: underline;
}
`
