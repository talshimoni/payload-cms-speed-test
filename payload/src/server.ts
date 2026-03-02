import express, { type Request as ExpressRequest, type Response as ExpressResponse } from 'express'
import { createPayloadRequest, getPayload, handleEndpoints } from 'payload'
import { configToSchema } from '@payloadcms/graphql'
import { execute, parse, validate } from 'graphql'
import config from './payload.config'

const app = express()
const port = Number(process.env.PORT || 3000)
const apiRoute = (process.env.PAYLOAD_API_ROUTE || '/api').replace(/\/+$/, '') || '/api'
const graphQLRoute = (process.env.PAYLOAD_GRAPHQL_ROUTE || '/graphql').replace(/\/+$/, '') || '/graphql'
const graphQLPlaygroundRoute =
  (process.env.PAYLOAD_GRAPHQL_PLAYGROUND_ROUTE || '/graphql-playground').replace(/\/+$/, '') ||
  '/graphql-playground'

async function toFetchRequest(req: ExpressRequest, overriddenPath?: string): Promise<Request> {
  const queryIndex = req.originalUrl.indexOf('?')
  const search = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : ''
  const originalPath = queryIndex >= 0 ? req.originalUrl.slice(0, queryIndex) : req.originalUrl
  const pathWithSearch = `${overriddenPath || originalPath}${search}`
  const url = `http://localhost:${port}${pathWithSearch}`
  const headers = new Headers()

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item)
      }
    } else if (typeof value === 'string') {
      headers.set(key, value)
    }
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Buffer[] = []

    await new Promise<void>((resolve, reject) => {
      req.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      req.on('end', resolve)
      req.on('error', reject)
    })

    if (chunks.length > 0) {
      init.body = Buffer.concat(chunks)
    }
  }

  return new Request(url, init)
}

async function sendFetchResponse(response: Response, res: ExpressResponse): Promise<void> {
  res.status(response.status)
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  if (!response.body) {
    res.end()
    return
  }

  const body = Buffer.from(await response.arrayBuffer())
  res.send(body)
}

function setPayloadResponseHeaders(payloadReq: any, res: ExpressResponse) {
  const responseHeaders = payloadReq?.responseHeaders as Headers | undefined
  if (!responseHeaders) {
    return
  }

  responseHeaders.forEach((value, key) => {
    res.setHeader(key, value)
  })
}

async function handleGraphQL(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const request = await toFetchRequest(req, `${apiRoute}/graphql`)
    const payloadReq = await createPayloadRequest({
      canSetHeaders: true,
      config,
      request: request.clone(),
    })

    const rawBody = await request.text()
    const body = rawBody ? JSON.parse(rawBody) : {}
    const query = typeof body?.query === 'string' ? body.query : ''

    if (!query.trim()) {
      res.status(400).json({
        errors: [{ message: 'Missing GraphQL query in request body' }],
      })
      return
    }

    const variables =
      typeof body.variables === 'string' ? JSON.parse(body.variables) : body.variables || undefined

    const operationName = typeof body.operationName === 'string' ? body.operationName : undefined
    const { schema, validationRules } = configToSchema(payloadReq.payload.config)
    const document = parse(query)
    const gqlValidationErrors = validate(
      schema,
      document,
      validationRules({
        variableValues: variables,
      } as any),
    )

    if (gqlValidationErrors.length > 0) {
      setPayloadResponseHeaders(payloadReq, res)
      res.status(400).json({
        errors: gqlValidationErrors,
      })
      return
    }

    const gqlContextHeaders: Record<string, string> = {}
    const result = await execute({
      contextValue: {
        headers: gqlContextHeaders,
        req: payloadReq,
      },
      document,
      operationName,
      schema,
      variableValues: variables,
    })

    setPayloadResponseHeaders(payloadReq, res)
    for (const [key, value] of Object.entries(gqlContextHeaders)) {
      res.setHeader(key, value)
    }

    res.status(200).json(result)
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : 'Payload GraphQL request failed'
    const status = message.includes('JSON') || message.includes('Syntax Error') ? 400 : 500
    res.status(status).json({
      errors: [
        {
          message,
        },
      ],
    })
  }
}

app.get('/', (_, res) => {
  res.send('Payload benchmark server is running')
})

app.post(`${apiRoute}/graphql`, handleGraphQL)

if (graphQLRoute !== `${apiRoute}/graphql`) {
  app.post(graphQLRoute, handleGraphQL)
}

function createPayloadBridge(forwardPathPrefix?: string) {
  return async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const request = await toFetchRequest(req, forwardPathPrefix)
      const response = await handleEndpoints({
        config,
        request,
      })

      await sendFetchResponse(response, res)
    } catch (error) {
      console.error(error)
      res.status(500).json({
        error: 'Payload request bridge failed',
      })
    }
  }
}

app.use(apiRoute, createPayloadBridge())

if (graphQLPlaygroundRoute !== `${apiRoute}/graphql-playground`) {
  app.use(graphQLPlaygroundRoute, createPayloadBridge(`${apiRoute}/graphql-playground`))
}

const init = async () => {
  const payload = await getPayload({ config })

  payload.logger.info(`Payload API URL: http://localhost:${port}${apiRoute}`)
  payload.logger.info(`Payload GraphQL URL: http://localhost:${port}${graphQLRoute}`)

  app.listen(port, () => {
    payload.logger.info(`Payload benchmark server listening on http://localhost:${port}`)
  })
}

init()
