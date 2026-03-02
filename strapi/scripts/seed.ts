#!/usr/bin/env ts-node -T
import { spawn, type ChildProcess } from 'child_process'
import { v4 as uuid } from 'uuid'

require('dotenv').config({ path: '.env' })

const recordCount = 30
const port = Number(process.env.PORT || 1337)
const seedHost = process.env.STRAPI_SEED_HOST || '127.0.0.1'
const baseUrl = process.env.STRAPI_BASE_URL || `http://${seedHost}:${port}`
const adminEmail = process.env.STRAPI_ADMIN_EMAIL || 'test@test.com'
const adminPassword = process.env.STRAPI_ADMIN_PASSWORD || 'Test123123'

const headers = {
  'Content-Type': 'application/json',
}

type Entity =
  | 'api::document.document'
  | 'api::relationship-a.relationship-a'
  | 'api::relationship-b.relationship-b'

type StrapiEntityResponse = {
  data?: {
    id?: number
    documentId?: string
  }
  meta?: Record<string, unknown>
  error?: {
    message?: string
  }
}

type StrapiAdminLoginResponse = {
  data?: {
    token?: string
    accessToken?: string
  }
  error?: {
    message?: string
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isConnectionRefusedError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const errorWithCause = error as Error & { cause?: { code?: string; errors?: Array<{ code?: string }> } }
  const cause = errorWithCause.cause

  if (cause?.code === 'ECONNREFUSED') {
    return true
  }

  return Boolean(cause?.errors?.some((innerError) => innerError?.code === 'ECONNREFUSED'))
}

async function getToken() {
  const response = await fetch(`${baseUrl}/admin/login`, {
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword,
    }),
    headers,
    method: 'POST',
  })

  const json = (await response.json()) as StrapiAdminLoginResponse

  if (!response.ok) {
    throw new Error(`Strapi admin login failed (${response.status}): ${JSON.stringify(json)}`)
  }

  const token = json.data?.token || json.data?.accessToken
  if (!token) {
    throw new Error('Strapi admin login succeeded but token was missing')
  }

  return token
}

function startLocalStrapiServer() {
  return spawn('yarn', ['develop'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
}

async function stopLocalStrapiServer(serverProcess: ChildProcess) {
  if (serverProcess.exitCode !== null) {
    return
  }

  serverProcess.kill('SIGTERM')

  await Promise.race([
    new Promise((resolve) => {
      serverProcess.once('exit', resolve)
    }),
    (async () => {
      await sleep(10_000)
      if (serverProcess.exitCode === null) {
        serverProcess.kill('SIGKILL')
      }
    })(),
  ])
}

async function waitForToken(timeoutMs: number) {
  const start = Date.now()
  let lastError: unknown

  while (Date.now() - start < timeoutMs) {
    try {
      return await getToken()
    } catch (error) {
      lastError = error
      if (!isConnectionRefusedError(error)) {
        throw error
      }
      await sleep(1_000)
    }
  }

  throw new Error(`Timed out waiting for Strapi at ${baseUrl}: ${String(lastError)}`)
}

async function create(entity: Entity, body: Record<string, unknown>, token: string) {
  const response = await fetch(`${baseUrl}/content-manager/collection-types/${entity}`, {
    body: JSON.stringify(body),
    headers: {
      ...headers,
      Authorization: `Bearer ${token}`,
    },
    method: 'POST',
  })

  const json = (await response.json()) as StrapiEntityResponse

  if (!response.ok) {
    throw new Error(`Strapi create failed (${entity}, ${response.status}): ${JSON.stringify(json)}`)
  }

  return json
}

async function main() {
  let serverProcess: ChildProcess | null = null
  let token: string

  try {
    token = await getToken()
  } catch (error) {
    if (!isConnectionRefusedError(error)) {
      throw error
    }

    console.log(`Strapi is not reachable at ${baseUrl}. Starting a temporary Strapi server for seeding...`)
    serverProcess = startLocalStrapiServer()
    token = await waitForToken(120_000)
  }

  try {
    const relationshipAIDs: number[] = []
    const relationshipBIDs: number[] = []

    for (let i = 0; i < recordCount; i++) {
      const created = await create(
        'api::relationship-b.relationship-b',
        {
          title: uuid(),
        },
        token,
      )

      if (created.data?.id) {
        relationshipBIDs.push(created.data.id)
      }
    }

    for (let i = 0; i < recordCount; i++) {
      const created = await create(
        'api::relationship-a.relationship-a',
        {
          title: uuid(),
          relationship_b: relationshipBIDs[Math.floor(Math.random() * relationshipBIDs.length)],
        },
        token,
      )

      if (created.data?.id) {
        relationshipAIDs.push(created.data.id)
      }
    }

    const arrayData = Array.from(Array(10).keys()).map(() => ({
      text: uuid(),
      NestedArray: Array.from(Array(10).keys()).map(() => {
        const randomRelationshipAID =
          relationshipAIDs[Math.floor(Math.random() * relationshipAIDs.length)]

        return {
          text: uuid(),
          relationship_a: randomRelationshipAID,
        }
      }),
    }))

    const blockData: Record<string, unknown>[] = []

    for (let i = 0; i <= 10; i++) {
      const randomRelationshipAID =
        relationshipAIDs[Math.floor(Math.random() * relationshipAIDs.length)]

      blockData.push({
        __component: 'document.relation-to-one',
        text: uuid(),
        relation: randomRelationshipAID,
      })
    }

    for (let i = 0; i <= 10; i++) {
      blockData.push({
        __component: 'document.has-many-relations',
        text: uuid(),
        relationToMany: Array.from(Array(3).keys()).map(() => {
          return relationshipAIDs[Math.floor(Math.random() * relationshipAIDs.length)]
        }),
      })
    }

    await create(
      'api::document.document',
      {
        title: 'Document1',
        Group: {
          text: uuid(),
          NestedGroup: {
            text: uuid(),
          },
        },
        array: arrayData,
        blocks: blockData,
        relationship_as: relationshipAIDs,
      },
      token,
    )
  } finally {
    if (serverProcess) {
      await stopLocalStrapiServer(serverProcess)
    }
  }
}

main().catch(async (error) => {
  console.error(error)
  process.exit(1)
})
