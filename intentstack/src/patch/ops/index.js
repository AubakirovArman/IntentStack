import { apiOps } from './api.js'
import { componentOps } from './component.js'
import { contentOps } from './content.js'
import { navigationOps } from './navigation.js'
import { actionOps } from './action.js'
import { tableOps } from './table.js'
import { pageOps } from './page.js'
import { sectionOps } from './section.js'
import { formOps } from './form.js'
import { navbarOps } from './navbar.js'
import { projectOps } from './project.js'
import { textOps } from './text.js'
import { entityOps } from './entity.js'

export const OPS = {
  ...projectOps,
  ...navigationOps,
  ...textOps,
  ...entityOps,
  ...actionOps,
  ...formOps,
  ...tableOps,
  ...sectionOps,
  ...navbarOps,
  ...pageOps,
  ...componentOps,
  ...contentOps,
  ...apiOps,
}
