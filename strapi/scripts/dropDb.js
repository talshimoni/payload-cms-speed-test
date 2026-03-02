#!/usr/bin/env ts-node -T
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
require('dotenv').config('../.env');
async function main() {
    const client = new pg_1.Client();
    await client.connect();
    // const res = await client.query('DROP DATABASE strapi;')
    const res2 = await client.query('CREATE DATABASE asd;');
    await client.end();
}
main();
