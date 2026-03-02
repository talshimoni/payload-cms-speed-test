import 'dotenv/config';
import { mongooseAdapter } from '@payloadcms/db-mongodb';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { buildConfig } from 'payload';
import path from 'path';
import Users from './collections/Users';
import { Documents } from './collections/Documents';
import { RelationshipA } from './collections/RelationshipA';
import { RelationshipB } from './collections/RelationshipB';
import { seed } from './seed';

const payloadDB = (process.env.PAYLOAD_DB || 'mongo').trim().toLowerCase();

const envMongoURI = process.env.MONGODB_URI?.trim();
const defaultMongoURI = 'mongodb://127.0.0.1/payload-speed-test';
const mongoURI =
  envMongoURI && /^(mongodb:\/\/|mongodb\+srv:\/\/)/.test(envMongoURI)
    ? envMongoURI
    : defaultMongoURI;

const postgresURL = (process.env.POSTGRES_URL || 'postgres://postgres:postgres@127.0.0.1:5432/payload_speed_test').trim();

const dbAdapter =
  payloadDB === 'postgres'
    ? postgresAdapter({
        pool: {
          connectionString: postgresURL,
        },
      })
    : mongooseAdapter({
        url: mongoURI,
      });

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || 'test',
  db: dbAdapter,
  serverURL: 'http://localhost:3000',
  admin: {
    user: Users.slug,
  },
  collections: [
    Documents,
    RelationshipA,
    RelationshipB,
    Users,
  ],
  typescript: {
    outputFile: path.resolve(__dirname, 'payload-types.ts'),
  },
  graphQL: {
    disable: false,
    schemaOutputFile: path.resolve(__dirname, 'generated-schema.graphql'),
  },
  onInit: async (payload) => {
    await seed(payload);
  }
});
