module.exports = ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    sessions: {
      accessTokenLifespan: env.int('ADMIN_ACCESS_TOKEN_LIFESPAN', 30 * 60),
      maxRefreshTokenLifespan: env.int('ADMIN_REFRESH_TOKEN_MAX_LIFESPAN', 30 * 24 * 60 * 60),
      maxSessionLifespan: env.int('ADMIN_SESSION_MAX_LIFESPAN', 24 * 60 * 60),
    },
  },
  apiToken: {
    salt: env('API_TOKEN_SALT'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT'),
    },
  },
  secrets: {
    encryptionKey: env('ADMIN_SECRETS_ENCRYPTION_KEY'),
  },
  watchIgnoreFiles: ['**/config/sync/**'],
})
