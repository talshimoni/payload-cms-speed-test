#!/usr/bin/env ts-node -T
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const recordCount = 30;
const baseUrl = 'http://localhost:1337';
const adminEmail = process.env.STRAPI_ADMIN_EMAIL || 'test@test.com';
const adminPassword = process.env.STRAPI_ADMIN_PASSWORD || 'Test123123';
const headers = {
    'Content-Type': 'application/json',
};
async function getToken() {
    const response = await fetch(`${baseUrl}/admin/login`, {
        body: JSON.stringify({
            email: adminEmail,
            password: adminPassword,
        }),
        headers,
        method: 'POST',
    });
    const json = (await response.json());
    if (!response.ok) {
        throw new Error(`Strapi admin login failed (${response.status}): ${JSON.stringify(json)}`);
    }
    const token = json.data?.token || json.data?.accessToken;
    if (!token) {
        throw new Error('Strapi admin login succeeded but token was missing');
    }
    return token;
}
async function create(entity, body, token) {
    const response = await fetch(`${baseUrl}/content-manager/collection-types/${entity}`, {
        body: JSON.stringify(body),
        headers: {
            ...headers,
            Authorization: `Bearer ${token}`,
        },
        method: 'POST',
    });
    const json = (await response.json());
    if (!response.ok) {
        throw new Error(`Strapi create failed (${entity}, ${response.status}): ${JSON.stringify(json)}`);
    }
    return json;
}
async function main() {
    const token = await getToken();
    const relationshipAIDs = [];
    const relationshipBIDs = [];
    for (let i = 0; i < recordCount; i++) {
        const created = await create('api::relationship-b.relationship-b', {
            title: (0, uuid_1.v4)(),
        }, token);
        if (created.data?.id) {
            relationshipBIDs.push(created.data.id);
        }
    }
    for (let i = 0; i < recordCount; i++) {
        const created = await create('api::relationship-a.relationship-a', {
            title: (0, uuid_1.v4)(),
            relationship_b: relationshipBIDs[Math.floor(Math.random() * relationshipBIDs.length)],
        }, token);
        if (created.data?.id) {
            relationshipAIDs.push(created.data.id);
        }
    }
    const arrayData = Array.from(Array(10).keys()).map(() => ({
        text: (0, uuid_1.v4)(),
        NestedArray: Array.from(Array(10).keys()).map(() => {
            const randomRelationshipAID = relationshipAIDs[Math.floor(Math.random() * relationshipAIDs.length)];
            return {
                text: (0, uuid_1.v4)(),
                relationship_a: randomRelationshipAID,
            };
        }),
    }));
    const blockData = [];
    for (let i = 0; i <= 10; i++) {
        const randomRelationshipAID = relationshipAIDs[Math.floor(Math.random() * relationshipAIDs.length)];
        blockData.push({
            __component: 'document.relation-to-one',
            text: (0, uuid_1.v4)(),
            relation: randomRelationshipAID,
        });
    }
    for (let i = 0; i <= 10; i++) {
        blockData.push({
            __component: 'document.has-many-relations',
            text: (0, uuid_1.v4)(),
            relationToMany: Array.from(Array(3).keys()).map(() => {
                return relationshipAIDs[Math.floor(Math.random() * relationshipAIDs.length)];
            }),
        });
    }
    await create('api::document.document', {
        title: 'Document1',
        Group: {
            text: (0, uuid_1.v4)(),
            NestedGroup: {
                text: (0, uuid_1.v4)(),
            },
        },
        array: arrayData,
        blocks: blockData,
        relationship_as: relationshipAIDs,
    }, token);
}
main();
