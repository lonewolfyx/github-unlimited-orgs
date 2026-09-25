/**
 * 与 API `GET /{username}` 响应字段一一对应。
 * `lable` 为已定型字段，保持原拼写不做更正。
 */
export interface OrgInfo {
  username: string
  lable: string
  avatar: string
  description: string | null
  html_url: string
  join_time?: string | null
}
