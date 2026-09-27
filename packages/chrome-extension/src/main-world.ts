/**
 * MAIN-world injection script. It runs at document_start and installs the patch
 * before page scripts execute. See mainWorldInterceptor in
 * @github-unlimited-orgs/core for the interception/replay behavior.
 */
import { mainWorldInterceptor, PANEL_MESSAGE_TYPE, PANEL_REQUEST_TYPE } from '@github-unlimited-orgs/core'

mainWorldInterceptor(PANEL_MESSAGE_TYPE, PANEL_REQUEST_TYPE)
