import fs from 'fs'
import path from 'path'

const getAverage = arr => arr.reduce((p, c) => p + c, 0) / arr.length

type TestOptions = {
  verbose: boolean
  requestCount: number
}

type QueryResult = {
  status: number
  responseBytes: number
}

function parseArgs(argv: string[]): { platform: string; options: TestOptions } {
  let platform: string | undefined
  let verbose = false
  let requestCount = 100

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '-v' || arg === '--verbose') {
      verbose = true
      continue
    }

    if (arg === '-n' || arg === '--requests') {
      const next = argv[i + 1]
      if (!next) {
        throw new Error('Missing value for --requests')
      }
      const parsed = Number(next)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid --requests value: ${next}`)
      }
      requestCount = parsed
      i += 1
      continue
    }

    if (arg.startsWith('--requests=')) {
      const value = arg.split('=')[1]
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid --requests value: ${value}`)
      }
      requestCount = parsed
      continue
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`)
    }

    if (!platform) {
      platform = arg
      continue
    }

    throw new Error(`Unexpected argument: ${arg}`)
  }

  if (!platform) {
    throw new Error('Missing platform argument. Usage: ts-node -T test.ts <payload|directus|strapi> [-v] [--requests 100]')
  }

  return {
    platform,
    options: {
      verbose,
      requestCount,
    },
  }
}

const { platform, options } = parseArgs(process.argv.slice(2))
const query = fs.readFileSync(path.resolve(__dirname, platform, 'query.graphql'), 'utf8')
const strapiTokenCachePath =
  process.env.STRAPI_TEST_TOKEN_CACHE_PATH || path.resolve(__dirname, '.strapi-benchmark-token')

let cachedStrapiAuthHeader: string | undefined
let cachedPayloadGraphQLEndpoint: string | undefined

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRetryAfterMs(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) {
    return null
  }

  const asSeconds = Number(retryAfterHeader)
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return asSeconds * 1000
  }

  const asDate = Date.parse(retryAfterHeader)
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - Date.now())
  }

  return null
}

function readCachedStrapiToken(): string | null {
  try {
    const token = fs.readFileSync(strapiTokenCachePath, 'utf8').trim()
    return token.length > 0 ? token : null
  } catch {
    return null
  }
}

function writeCachedStrapiToken(token: string) {
  fs.writeFileSync(strapiTokenCachePath, token, 'utf8')
}

function clearCachedStrapiToken() {
  try {
    fs.unlinkSync(strapiTokenCachePath)
  } catch {
    // no-op
  }
}

async function isValidStrapiGraphQLToken(baseUrl: string, token: string): Promise<boolean> {
  const res = await fetch(`${baseUrl}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: 'query { __typename }',
    }),
  })

  if (!res.ok) {
    return false
  }

  try {
    const body = await res.json()
    return !body?.errors?.length
  } catch {
    return false
  }
}

async function postJsonWithRateLimitRetry(
  url: string,
  body: Record<string, unknown>,
  label: string,
  headers: Record<string, string> = {},
  maxAttempts = 6,
) {
  let attempt = 0

  while (attempt < maxAttempts) {
    attempt += 1
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    })

    const responseText = await response.text()
    let responseJson: any = null
    try {
      responseJson = responseText ? JSON.parse(responseText) : null
    } catch {
      responseJson = responseText
    }

    if (response.status !== 429 || attempt === maxAttempts) {
      return {
        response,
        responseJson,
      }
    }

    const retryDelayMs =
      parseRetryAfterMs(response.headers.get('retry-after')) ?? Math.min(30_000, 1000 * 2 ** (attempt - 1))

    console.log(
      `[strapi:test] ${label} was rate-limited (429). Retrying in ${retryDelayMs}ms (attempt ${attempt}/${maxAttempts})`,
    )
    await sleep(retryDelayMs)
  }

  throw new Error(`[strapi:test] ${label} failed after ${maxAttempts} attempts`)
}

const main = async () => {
  let authHeader
  let performQuery: () => Promise<QueryResult>
  if (platform === 'payload') {
    authHeader = await getPayloadAuthHeader()
    performQuery = async () => await performPayloadQuery(authHeader, query)
  } else if (platform === 'directus') {
    authHeader = await getDirectusAuthHeader()
    performQuery = async () => await performDirectusQuery(authHeader, query)
  } else if (platform === 'strapi') {
    authHeader = await getStrapiAuthHeader()
    performQuery = async () => await performStrapiQuery(authHeader, query)
  } else {
    throw new Error(`Unknown platform: ${platform}`)
  }

  const startTime = new Date().getTime()
  const fetchTimes: number[] = []
  let responseBytes = 0
  const statusCounts = new Map<number, number>()

  await [...Array(options.requestCount)].reduce(async (priorFetch, _, i) => {
    await priorFetch
    const sendDate = new Date().getTime()

    const result = await performQuery()
    const receiveDate = new Date().getTime()
    const completionTime = receiveDate - sendDate

    responseBytes += result.responseBytes
    statusCounts.set(result.status, (statusCounts.get(result.status) || 0) + 1)

    if (options.verbose) {
      console.log(
        `Request ${i + 1} completed in ${completionTime}ms (status=${result.status}, bytes=${result.responseBytes})`,
      )
    } else {
      console.log(`Request ${i + 1} completed in ${completionTime}ms`)
    }

    fetchTimes.push(completionTime)
  }, Promise.resolve())

  const endTime = new Date().getTime()
  const totalTestTime = endTime - startTime

  const average = getAverage(fetchTimes)
  const max = Math.max(...fetchTimes)
  const min = Math.min(...fetchTimes)

  console.log(`Performance test completed in ${totalTestTime}ms`)
  console.log(`Average response time: ${average}ms`)
  console.log(`Max response time: ${max}ms`)
  console.log(`Min response time: ${min}ms`)
  console.log(`Total response body bytes: ${responseBytes}`)
  console.log(
    `Status codes: ${Array.from(statusCounts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([status, count]) => `${status}x${count}`)
      .join(', ')}`,
  )

  fs.writeFileSync(
    `results-${platform}.json`,
    JSON.stringify({ average, max, min, totalTestTime }),
    'utf8',
  )
}

main()

// Auth
async function getPayloadAuthHeader() {
  const baseUrl = process.env.PAYLOAD_TEST_BASE_URL || 'http://localhost:3000'

  const res = await fetch(`${baseUrl}/api/users/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'dev@payloadcms.com',
      password: 'test',
    }),
  })
  const { token } = await res.json()
  return `JWT ${token}`
}

async function resolvePayloadGraphQLEndpoint(authHeader: string): Promise<string> {
  if (cachedPayloadGraphQLEndpoint) {
    return cachedPayloadGraphQLEndpoint
  }

  const explicitEndpoint = process.env.PAYLOAD_TEST_GRAPHQL_ENDPOINT?.trim()
  if (explicitEndpoint) {
    cachedPayloadGraphQLEndpoint = explicitEndpoint
    return explicitEndpoint
  }

  const baseUrl = process.env.PAYLOAD_TEST_BASE_URL || 'http://localhost:3000'
  const candidates = [`${baseUrl}/api/graphql`, `${baseUrl}/graphql`]

  for (const endpoint of candidates) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        query: 'query { __typename }',
      }),
    })

    if (res.status !== 404) {
      cachedPayloadGraphQLEndpoint = endpoint
      return endpoint
    }
  }

  throw new Error(
    `Payload GraphQL endpoint not found. Tried: ${candidates.join(
      ', ',
    )}. Set PAYLOAD_TEST_GRAPHQL_ENDPOINT (or PAYLOAD_TEST_BASE_URL) and verify Payload GraphQL is enabled.`,
  )
}

async function getDirectusAuthHeader() {
  const baseUrl = process.env.DIRECTUS_TEST_BASE_URL || 'http://localhost:8055'
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'dev@payloadcms.com',
      password: 'test',
    }),
  })

  if (!res.ok) {
    throw new Error(`Directus login failed with status ${res.status}`)
  }

  const data = await res.json()
  const token = data?.data?.access_token || data?.access_token

  if (!token) {
    throw new Error('Directus login succeeded but no access token was returned')
  }

  return `Bearer ${token}`
}

async function getStrapiAuthHeader() {
  if (cachedStrapiAuthHeader) {
    return cachedStrapiAuthHeader
  }

  const baseUrl = process.env.STRAPI_TEST_BASE_URL || 'http://localhost:1337'
  const explicitApiToken = process.env.STRAPI_TEST_API_TOKEN?.trim()

  if (explicitApiToken) {
    cachedStrapiAuthHeader = `Bearer ${explicitApiToken}`
    return cachedStrapiAuthHeader
  }

  const cachedToken = readCachedStrapiToken()
  if (cachedToken) {
    const isValid = await isValidStrapiGraphQLToken(baseUrl, cachedToken)
    if (isValid) {
      cachedStrapiAuthHeader = `Bearer ${cachedToken}`
      return cachedStrapiAuthHeader
    }
    clearCachedStrapiToken()
  }

  const adminEmail = process.env.STRAPI_ADMIN_EMAIL || 'test@test.com'
  const adminPassword = process.env.STRAPI_ADMIN_PASSWORD || 'Test123123'

  const { response: loginRes, responseJson: loginBody } = await postJsonWithRateLimitRetry(
    `${baseUrl}/admin/login`,
    {
      email: adminEmail,
      password: adminPassword,
    },
    'admin login',
  )

  if (!loginRes.ok) {
    throw new Error(`Strapi admin login failed (${loginRes.status}): ${JSON.stringify(loginBody)}`)
  }

  const adminToken = loginBody?.data?.token || loginBody?.data?.accessToken
  if (!adminToken) {
    throw new Error('Strapi admin login succeeded but no admin token was returned')
  }

  const tokenName = `benchmark-${Date.now()}`
  const { response: createApiTokenRes, responseJson: createApiTokenBody } = await postJsonWithRateLimitRetry(
    `${baseUrl}/admin/api-tokens`,
    {
      name: tokenName,
      description: 'Temporary token for speed-test benchmark',
      type: 'full-access',
      lifespan: null,
    },
    'api token creation',
    {
      Authorization: `Bearer ${adminToken}`,
    },
  )

  if (!createApiTokenRes.ok) {
    throw new Error(
      `Strapi API token creation failed (${createApiTokenRes.status}): ${JSON.stringify(createApiTokenBody)}`,
    )
  }

  const accessKey = createApiTokenBody?.data?.accessKey
  if (!accessKey) {
    throw new Error('Strapi API token creation succeeded but no accessKey was returned')
  }

  writeCachedStrapiToken(accessKey)
  cachedStrapiAuthHeader = `Bearer ${accessKey}`
  return cachedStrapiAuthHeader
}

// Queries
async function performPayloadQuery(authHeader: string, query: string) {
  const endpoint = await resolvePayloadGraphQLEndpoint(authHeader)
  return performGraphQLQuery(endpoint, authHeader, query, 'Payload')
}

async function performDirectusQuery(authHeader: string, query: string) {
  const baseUrl = process.env.DIRECTUS_TEST_BASE_URL || 'http://localhost:8055'
  return performGraphQLQuery(`${baseUrl}/graphql`, authHeader, query, 'Directus')
}

async function performStrapiQuery(authHeader: string, query: string) {
  const baseUrl = process.env.STRAPI_TEST_BASE_URL || 'http://localhost:1337'
  return performGraphQLQuery(`${baseUrl}/graphql`, authHeader, query, 'Strapi')
}

async function performGraphQLQuery(
  endpoint: string,
  authHeader: string,
  query: string,
  platformName: string,
): Promise<QueryResult> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify({
      query,
    }),
  })
  const bodyText = await res.text()
  const bytes = Buffer.byteLength(bodyText, 'utf8')

  if (!res.ok) {
    throw new Error(`${platformName} GraphQL query failed (${res.status}): ${bodyText}`)
  }

  let body: any = null
  try {
    body = bodyText ? JSON.parse(bodyText) : null
  } catch {
    throw new Error(`${platformName} GraphQL response was not valid JSON`)
  }

  if (body?.errors?.length) {
    throw new Error(`${platformName} GraphQL returned errors: ${JSON.stringify(body.errors)}`)
  }

  return {
    status: res.status,
    responseBytes: bytes,
  }
}
