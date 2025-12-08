import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

export interface AhaConfig {
  apiKey: string
  subaccountId?: string
}

const CONFIG_FILE_NAME = 'aha-config.json'

/**
 * Get the path to the AHA config file in the user's app data directory
 */
function getConfigPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, CONFIG_FILE_NAME)
}

/**
 * Read the AHA config from the user's app data directory
 * @returns The config object or null if it doesn't exist or is invalid
 */
export async function readAhaConfig(): Promise<AhaConfig | null> {
  try {
    const configPath = getConfigPath()
    const configData = await fs.readFile(configPath, 'utf-8')
    const config = JSON.parse(configData) as AhaConfig

    // Validate config structure
    if (!config.apiKey || typeof config.apiKey !== 'string') {
      console.error('[AhaConfig] Invalid config: missing or invalid apiKey')
      return null
    }

    // subaccountId is optional, but if present must be a string
    if (config.subaccountId !== undefined && typeof config.subaccountId !== 'string') {
      console.error('[AhaConfig] Invalid config: subaccountId must be a string if provided')
      return null
    }

    return config
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, which is fine
      return null
    }
    console.error('[AhaConfig] Error reading config:', error)
    return null
  }
}

/**
 * Save the AHA config to the user's app data directory
 * @param config The config object to save
 * @returns true if successful, false otherwise
 */
export async function saveAhaConfig(config: AhaConfig): Promise<boolean> {
  try {
    // Validate config before saving
    if (!config.apiKey || typeof config.apiKey !== 'string') {
      throw new Error('Invalid config: apiKey is required and must be a string')
    }

    if (config.subaccountId !== undefined && typeof config.subaccountId !== 'string') {
      throw new Error('Invalid config: subaccountId must be a string if provided')
    }

    const configPath = getConfigPath()
    const configData = JSON.stringify(config, null, 2)
    await fs.writeFile(configPath, configData, 'utf-8')
    console.log('[AhaConfig] Config saved successfully')
    return true
  } catch (error) {
    console.error('[AhaConfig] Error saving config:', error)
    return false
  }
}

/**
 * Delete the AHA config file
 * @returns true if successful, false otherwise
 */
export async function deleteAhaConfig(): Promise<boolean> {
  try {
    const configPath = getConfigPath()
    await fs.unlink(configPath)
    console.log('[AhaConfig] Config deleted successfully')
    return true
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, which is fine
      return true
    }
    console.error('[AhaConfig] Error deleting config:', error)
    return false
  }
}

/**
 * Check if AHA config exists
 * @returns true if config exists and is valid, false otherwise
 */
export async function hasAhaConfig(): Promise<boolean> {
  const config = await readAhaConfig()
  return config !== null
}




