#!/usr/bin/env ts-node -T
import shelljs from 'shelljs'

require('dotenv').config({ path: '.env' })

const email = process.env.STRAPI_ADMIN_EMAIL || 'test@test.com'
const password = process.env.STRAPI_ADMIN_PASSWORD || 'Test123123'

async function main() {
  try {
    const createAdminCmd = `yarn strapi admin:create-user --firstname=Jane --lastname=Doe --email=${email} --password=${password}`
    console.log('\n', createAdminCmd)
    const { stdout, code } = shelljs.exec(createAdminCmd)
    if (code) {
      throw Error(`Unable to create admin user: ${code},\n ${stdout}`)
    }
  } catch (error) {
    console.log('Error creating admin user. User likely already exists')
  }
}

main()
