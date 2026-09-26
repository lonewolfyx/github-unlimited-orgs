export interface OrgInfo {
  username: string
  lable: string
  avatar: string
}

export interface SidePanelData {
  userStatus: {
    organizationOptions: Array<{
      label: string
      value: number
    }>
  }
}

export interface PanelMessage {
  type: string
  routeKey: string
  data: SidePanelData
}

export type FetchOrgsResponse
  = | { ok: true, data: OrgInfo[] }
    | { ok: false, error: string }
