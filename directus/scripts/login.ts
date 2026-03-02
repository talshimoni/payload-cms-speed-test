const login = async () => {
  const response = await fetch('http://localhost:8055/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'dev@payloadcms.com',
      password: 'test',
    }),
  })

  if (!response.ok) {
    throw new Error(`Directus login failed with status ${response.status}`)
  }

  const data = await response.json()
  const token = data?.data?.access_token || data?.access_token

  if (!token) {
    throw new Error('Directus login succeeded but no access token was returned')
  }

  console.log({ token })
  return token as string
}

export default login
