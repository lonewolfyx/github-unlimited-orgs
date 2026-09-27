import { startProfileEnhancer } from '@github-unlimited-orgs/core'
import { requestOrganizations } from './api'
import { installPageInterceptor } from './page-interceptor'

installPageInterceptor()
startProfileEnhancer({ requestOrganizations })
