#!/usr/bin/env ts-node -T
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const shelljs_1 = __importDefault(require("shelljs"));
require('dotenv').config('../.env');
const email = 'test@test.com';
const password = 'Test123123';
async function main() {
    try {
        const createAdminCmd = `npx strapi admin:create-user --firstname=Jane --lastname=Doe --email=${email} --password=${password}`;
        console.log('\n', createAdminCmd);
        const { stdout, code } = shelljs_1.default.exec(createAdminCmd);
        if (code) {
            throw Error(`Unable to create admin user: ${code},\n ${stdout}`);
        }
    }
    catch (error) {
        console.log('Error creating admin user. User likely already exists');
    }
}
main();
