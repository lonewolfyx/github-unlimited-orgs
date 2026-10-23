import { startProfileEnhancer } from '@github-unlimited-orgs/core'
import { requestOrganizations, requestSelfOrganizations } from './api'

startProfileEnhancer({ requestOrganizations, requestSelfOrganizations })
