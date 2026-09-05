import * as browserFiles from '../browserFiles'
import * as browserStorage from '../browserStorage'
import * as projectStore from '../projectStore'
import * as themePreference from '../themePreference'
import { createBrowserAssetResolver } from './browserAssetResolver'
import type {
  OpenPanelFileServices,
  OpenPanelHostServices,
  OpenPanelProjectRepository,
} from '../module/hostServices'

function moduleExport<T>(module: object, name: string, fallback: T): T {
  if (!Object.prototype.hasOwnProperty.call(module, name)) return fallback
  const candidate = (module as Record<string, unknown>)[name]
  return (candidate as T) ?? fallback
}

function unavailableAsync(name: string): Promise<never> {
  return Promise.reject(new Error(`OpenPanel standalone service '${name}' is unavailable.`))
}

export function createDefaultOpenPanelHostServices(): OpenPanelHostServices {
  const projects: OpenPanelProjectRepository = {
    listPanelProjects: moduleExport(projectStore, 'listPanelProjects', () => unavailableAsync('listPanelProjects')),
    loadLastPanelProject: moduleExport(projectStore, 'loadLastPanelProject', () => unavailableAsync('loadLastPanelProject')),
    createPanelProject: moduleExport(projectStore, 'createPanelProject', () => unavailableAsync('createPanelProject')),
    savePanelProject: moduleExport(projectStore, 'savePanelProject', () => unavailableAsync('savePanelProject')),
    saveActiveProject: moduleExport(projectStore, 'saveActiveProject', () => unavailableAsync('saveActiveProject')),
    renamePanelProject: moduleExport(projectStore, 'renamePanelProject', () => unavailableAsync('renamePanelProject')),
    duplicatePanelProject: moduleExport(projectStore, 'duplicatePanelProject', () => unavailableAsync('duplicatePanelProject')),
    archivePanelProject: moduleExport(projectStore, 'archivePanelProject', () => unavailableAsync('archivePanelProject')),
    restorePanelProject: moduleExport(projectStore, 'restorePanelProject', () => unavailableAsync('restorePanelProject')),
    deletePanelProject: moduleExport(projectStore, 'deletePanelProject', () => unavailableAsync('deletePanelProject')),
    setActivePanelProject: moduleExport(projectStore, 'setActivePanelProject', () => undefined),
  }
  const files: OpenPanelFileServices = {
    openTextFile: moduleExport(browserFiles, 'openTextFile', () => unavailableAsync('openTextFile')),
    readTextFileWithinLimit: moduleExport(browserFiles, 'readTextFileWithinLimit', () => unavailableAsync('readTextFileWithinLimit')),
    saveBlob: moduleExport(browserFiles, 'saveBlob', () => unavailableAsync('saveBlob')),
  }
  return {
    storage: {
      getItem: moduleExport(browserStorage, 'readLocalStorage', () => null),
      setItem: moduleExport(browserStorage, 'writeLocalStorage', () => false),
      removeItem: moduleExport(browserStorage, 'removeLocalStorage', () => undefined),
    },
    projects,
    files,
    theme: {
      read: moduleExport(themePreference, 'readThemePreference', () => 'light' as const),
      save: moduleExport(themePreference, 'saveThemePreference', () => undefined),
    },
    assets: createBrowserAssetResolver(),
  }
}
