interface GmResponse<T> {
  status: number
  response: T
  responseText: string
}

interface GmRequestControl {
  abort: () => void
}

interface GmRequestDetails<T> {
  method: 'GET'
  url: string
  responseType: 'json'
  timeout: number
  anonymous: boolean
  onload: (response: GmResponse<T>) => void
  onerror: () => void
  ontimeout: () => void
  onabort: () => void
}

declare function GM_xmlhttpRequest<T>(details: GmRequestDetails<T>): GmRequestControl

declare function GM_addElement(
  tagName: string,
  attributes: Record<string, string>,
): HTMLElement | null
